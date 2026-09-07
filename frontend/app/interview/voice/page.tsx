"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, PencilLine, PenLine, Radio, Check, Loader2, Sparkles, User, Bot, Volume2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { SESSION, apiService } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import {
  getWorkletUrl,
  downsampleAndConvertToInt16,
  pcmToBase64,
  newResampleState,
  resamplePcmToFloat32,
  type ResampleState,
} from "@/lib/voice/audio";
import { isEchoOfAdvisor } from "@/lib/voice/echo";
import { appendDelta, promoteStatus } from "@/lib/voice/transcript";

type Stage = "checking" | "ready" | "live" | "extracting" | "done" | "fallback";
type ChatMsg = { id: string; role: "advisor" | "user" | "system"; text: string; time?: string; isInterim?: boolean };

let msgId = 0;
const nextId = () => `m${++msgId}`;


function formatTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}


export default function VoiceInterviewPage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [error, setError] = useState("");
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [liveModel, setLiveModel] = useState("gemini-2.5-flash-native-audio-latest");
  const [liveApiVersion, setLiveApiVersion] = useState("v1beta");
  const [liveVoice, setLiveVoice] = useState("Puck");
  const [micLevel, setMicLevel] = useState(0);
  const [isAdvisorSpeaking, setIsAdvisorSpeaking] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const nextTimeRef = useRef(0);
  const resampleRef = useRef<ResampleState>(newResampleState());
  /** Every source node still scheduled or sounding. Barge-in has to stop these
   *  individually — Web Audio has no "cancel everything queued" call, and the
   *  advisor's remaining audio is already handed to the graph by the time the
   *  user starts talking over it. */
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const speakerEndTimeRef = useRef(0);
  const isAdvisorSpeakingRef = useRef(false);
  const lastAdvisorSpokeTimeRef = useRef(0);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recentAdvisorPhrasesRef = useRef<string[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null);
  const sessionReadyRef = useRef(false);
  const stageRef = useRef<Stage>("checking");
  const logRef = useRef<ChatMsg[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef("");

  useEffect(() => { stageRef.current = stage; }, [stage]);

  const pushMsg = useCallback((role: ChatMsg["role"], text: string) => {
    logRef.current = [...logRef.current, { id: nextId(), role, text, time: formatTime() }];
    setMessages(logRef.current);
  }, []);

  const appendMsg = useCallback((role: "advisor" | "user", delta: string) => {
    logRef.current = appendDelta(logRef.current, role, delta, nextId(), formatTime());
    setMessages(logRef.current);
  }, []);

  /* Screen Wake Lock, held for as long as the session is live.
     iOS auto-locks the display after a short idle, and a voice interview is
     minutes of deliberately not touching the screen — so it blanked mid-answer,
     Safari suspended the page, and the AudioContexts and the socket went with
     it. Reported as "the phone turns itself off during the advisor".
     Safari has shipped this since 16.4 and Chrome on Android since 84; where it
     is absent the request throws and the session runs exactly as before. */
  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    sentinel?.release().catch(() => {});
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator) || wakeLockRef.current) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      // The browser releases the lock itself whenever the page is hidden. Clear
      // the ref when that happens so the visibilitychange handler below knows to
      // take a fresh one rather than assuming it still holds this one.
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      });
    } catch (err) {
      // Not fatal — an older iOS, a denied request, or a battery-saver mode.
      console.warn("[voice] Screen wake lock unavailable:", err);
    }
  }, []);

  const cleanupSession = useCallback(() => {
    releaseWakeLock();
    sessionReadyRef.current = false;
    isAdvisorSpeakingRef.current = false;
    speakerEndTimeRef.current = 0;
    try {
      sessionRef.current?.sendRealtimeInput({
        audioStreamEnd: true,
      });
    } catch {}
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    micCtxRef.current?.close().catch(() => {});
    playCtxRef.current?.close().catch(() => {});
    try { sessionRef.current?.close(); } catch {}
    sessionRef.current = null;
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    setIsAdvisorSpeaking(false);
  }, [releaseWakeLock]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Nothing tore the session down when this page unmounted: leaving mid-interview
  // (the "Back to home" link, the browser's back gesture) left the microphone
  // open with the recording indicator lit, the socket connected, and — now that
  // the page takes one — the wake lock held, so the phone would stay awake on
  // whatever the user opened next. Held through a ref so the teardown runs on
  // unmount only, not every time the callback identity changes.
  const cleanupRef = useRef(cleanupSession);
  useEffect(() => {
    cleanupRef.current = cleanupSession;
  }, [cleanupSession]);
  useEffect(() => () => cleanupRef.current(), []);

  // The wake lock is dropped by the browser every time the page hides, so one
  // glance at another app would leave the rest of the interview unprotected.
  // Take a fresh lock on return, and resume the audio contexts iOS suspends
  // while backgrounded — otherwise playback comes back silent.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || stageRef.current !== "live") return;
      requestWakeLock();
      playCtxRef.current?.resume().catch(() => {});
      micCtxRef.current?.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [requestWakeLock]);

  // Fetch live token
  useEffect(() => {
    apiService.getLiveToken()
      .then((r) => {
        setLiveToken(r.token);
        if (r.model) setLiveModel(r.model);
        if (r.api_version) setLiveApiVersion(r.api_version);
        setStage("ready");
      })
      .catch((e: unknown) => {
        const status = (e as { status?: number })?.status;
        const detail = e instanceof Error ? e.message : String(e);
        setError(status === 501 ? t("v.errNoKey") : t("v.errUnreachable") + ` (${detail})`);
        setStage("fallback");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Lead time before the first chunk of an utterance, absorbing network jitter
   *  so playback never underruns mid-sentence. See playPcmDirect. */
  const PLAYBACK_JITTER_LEAD = 0.12;

  /** The rate Gemini's native-audio output actually arrives at. The playback
   *  context asks for it, and the mimeType parse falls back to it. */
  const ADVISOR_PCM_RATE = 24000;

  /** Extra hold after the advisor's audio ends before the mic is unmuted.
   *  getUserMedia already requests echoCancellation, so this is a guard on top
   *  of hardware AEC rather than the only defence. It was 0.4s, which clipped
   *  the first 400ms of a reply. */
  const ECHO_TAIL = 0.15;

  // --- Audio helpers ---

  const playPcmDirect = useCallback((samples: Int16Array, rate: number) => {
    const ctx = playCtxRef.current;
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    try {
      // The drain test has to clear the output buffer, not just zero.
      // ctx.currentTime is the frame after the last one the graph rendered, and
      // the audio thread renders a whole callback buffer at a time, so a start
      // scheduled inside that buffer is clamped to its edge: the node plays late
      // and in full, overlapping the one still sounding, while nextTimeRef
      // advances by the nominal duration and puts the chunk after it deeper into
      // the past. Comparing against currentTime alone never leaves that window.
      // Simulated over 300 chunks: on desktop's 2.7ms buffer this never fires,
      // on a 20-40ms Android buffer it clamped 3-18 starts and accumulated
      // 20-180ms of overlap — the asymmetry users reported. Re-arming a buffer
      // early costs no extra silence: it is a smaller jump forward than
      // re-arming once the queue has already fallen behind.
      const safetyLead = Math.min(2 * (ctx.baseLatency || 0.01), PLAYBACK_JITTER_LEAD / 2);
      const drained = nextTimeRef.current < ctx.currentTime + safetyLead;

      // The buffer is built at the context's own rate, never at the PCM's.
      // Declaring 24000Hz on a context running at the device rate left the graph
      // resampling every ~20ms node independently, carrying no filter state
      // between them, so each boundary got a sample-and-hold step — a 50Hz tick
      // under the whole utterance. It also measured duration in the source's
      // time base, so on any device rate that is not a multiple of 24000 (44100
      // is the common one) nextTimeRef advanced by a different number of frames
      // than were actually rendered and the nodes crept into overlap.
      // A drained queue is a real break in the audio, and the only place the
      // carried interpolation state is meaningless.
      if (drained) resampleRef.current = newResampleState();
      const frames = resamplePcmToFloat32(samples, rate, ctx.sampleRate, resampleRef.current);
      if (frames.length === 0) return;

      const audioBuffer = ctx.createBuffer(1, frames.length, ctx.sampleRate);
      audioBuffer.getChannelData(0).set(frames);
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ctx.destination);
      // Jitter buffer. Chunks were scheduled at max(now, nextTime) with no lead,
      // so the moment one arrived after the queue drained — which network jitter
      // guarantees — playback restarted at "now" and the silence in between was
      // an audible click. At 20ms chunks that fires several times a second and
      // reads as a buzz. Measured: ±10ms jitter produced ~17 gaps per 300 chunks
      // with no lead, ~0.1 with 120ms. The cost is 120ms of added delay at the
      // start of each utterance, not on every chunk — continuations stay seamless.
      const when = drained
        ? ctx.currentTime + PLAYBACK_JITTER_LEAD   // queue drained: re-arm
        : nextTimeRef.current;                      // mid-utterance: continue
      src.start(when);
      activeSourcesRef.current.push(src);
      // Without this the array grows for the whole session — one entry per 20ms
      // chunk is ~3000 dead nodes a minute.
      src.onended = () => {
        const at = activeSourcesRef.current.indexOf(src);
        if (at !== -1) activeSourcesRef.current.splice(at, 1);
      };
      const endTime = when + audioBuffer.duration;
      nextTimeRef.current = endTime;

      speakerEndTimeRef.current = Math.max(speakerEndTimeRef.current, endTime + ECHO_TAIL);
      isAdvisorSpeakingRef.current = true;
      lastAdvisorSpokeTimeRef.current = Date.now();
      setIsAdvisorSpeaking(true);

      // Hardware mic gain to 0 while advisor is speaking
      if (micGainRef.current && micCtxRef.current) {
        micGainRef.current.gain.setValueAtTime(0, micCtxRef.current.currentTime);
      }

      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
      const msUntilDone = Math.max(50, (speakerEndTimeRef.current - ctx.currentTime) * 1000);
      // The timer fires on wall clock; the guard reads the audio clock. Those
      // disagree whenever the audio thread is starved or the context is
      // suspended — routine on Android. The guard had no else branch, so a miss
      // scheduled nothing further and isAdvisorSpeakingRef stayed true with the
      // mic gain pinned at 0: the interview stopped hearing the user for the
      // rest of the session, and only a new advisor chunk could have rearmed it.
      // Poll until the audio clock agrees, and give up on wall clock so a
      // context that never advances cannot hold the microphone shut.
      const giveUpAt = Date.now() + msUntilDone + 1500;
      const settle = () => {
        const clockDone =
          !ctx || ctx.state === "closed" || ctx.currentTime >= speakerEndTimeRef.current - 0.05;
        if (!clockDone && Date.now() < giveUpAt) {
          speakingTimeoutRef.current = setTimeout(settle, 250);
          return;
        }
        isAdvisorSpeakingRef.current = false;
        lastAdvisorSpokeTimeRef.current = Date.now();
        setIsAdvisorSpeaking(false);

        // Restore mic gain after echo dissipation
        if (micGainRef.current && micCtxRef.current) {
          micGainRef.current.gain.setValueAtTime(1, micCtxRef.current.currentTime);
        }
      };
      speakingTimeoutRef.current = setTimeout(settle, msUntilDone);
    } catch (err) {
      console.error("[voice] playPcmDirect error:", err);
    }
  }, []);

  /**
   * Drop everything queued and hand the microphone straight back.
   *
   * The model decides on its own that it was interrupted and stops generating,
   * but audio it already sent is scheduled in the graph and keeps playing —
   * up to a second of the advisor talking over someone who has started
   * answering, with the mic muted the whole time because playback is still
   * "sounding". Stopping the nodes is the only way back: Web Audio has no
   * cancel-what-is-queued call.
   */
  const stopPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current.splice(0)) {
      // onended fires on stop() too, and its splice would mutate the array we
      // are walking — detach first.
      src.onended = null;
      try { src.stop(); } catch {}
      try { src.disconnect(); } catch {}
    }
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    // The next chunk is the start of a new utterance, not a continuation, so
    // the schedule and the resampler seam both have to forget the old one.
    nextTimeRef.current = 0;
    resampleRef.current = newResampleState();
    speakerEndTimeRef.current = 0;
    isAdvisorSpeakingRef.current = false;
    lastAdvisorSpokeTimeRef.current = Date.now();
    setIsAdvisorSpeaking(false);
    if (micGainRef.current && micCtxRef.current) {
      micGainRef.current.gain.setValueAtTime(1, micCtxRef.current.currentTime);
    }
  }, []);

  const handleIncomingPcm = useCallback((mimeType: string, base64: string) => {
    isAdvisorSpeakingRef.current = true;
    lastAdvisorSpokeTimeRef.current = Date.now();
    setIsAdvisorSpeaking(true);
    // A missing rate fell back correctly, a nonsensical one did not: "rate=0"
    // or a non-numeric rate reached the resampler as a ratio of 0 or NaN, which
    // fills the buffer with zeros — a silent turn with nothing logged.
    const parsed = Number(mimeType.match(/rate=(\d+)/)?.[1]);
    const rate = parsed >= 8000 && parsed <= 96000 ? parsed : ADVISOR_PCM_RATE;
    const bin = atob(base64);
    const sampleCount = Math.floor(bin.length / 2);
    const samples = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16;
    }
    if (samples.length > 0) {
      playPcmDirect(samples, rate);
    }
  }, [playPcmDirect]);

  // Sends audio to Gemini Live using mediaChunks — strictly muted when Advisor is speaking
  const safeSendAudio = useCallback((pcmInt16: Int16Array) => {
    if (!sessionReadyRef.current || !sessionRef.current) return;
    const playCtx = playCtxRef.current;
    // Mute microphone while advisor is speaking or while sound is echoing in room
    if (
      isAdvisorSpeakingRef.current ||
      (playCtx && playCtx.currentTime < speakerEndTimeRef.current) ||
      Date.now() - lastAdvisorSpokeTimeRef.current < 400
    ) {
      return;
    }
    try {
      const b64 = pcmToBase64(pcmInt16);
      // Must be `audio`, not the legacy `media`: it serialises to
      // realtime_input.media_chunks, which gemini-3.x live models reject with
      // close 1007 ("media_chunks is deprecated. Use audio, video, or text").
      sessionRef.current.sendRealtimeInput({
        audio: { data: b64, mimeType: "audio/pcm;rate=16000" },
      });
    } catch (err) {
      console.error("[voice] sendRealtimeInput failed:", err);
    }
  }, []);

  // --- Extract profile via backend ---

  const extractAndFinish = useCallback(async (transcript: string) => {
    setStage("extracting");
    cleanupSession();
    try {
      const { profile } = await apiService.extractInterview(transcript, lang);
      const base = SESSION.loadProfile();
      const merged = { ...base, ...profile };
      SESSION.saveProfile(merged);
      setStage("done");
      setTimeout(() => router.push(merged.home_postcode ? "/sliders" : "/interview/form"), 1500);
    } catch (e) {
      console.error("[voice] extract failed:", e);
      setStage("fallback");
      setError("Could not extract profile. Please use the form instead.");
    }
  }, [cleanupSession, lang, router]);

  // --- Start Live Interview ---

  const startLive = async () => {
    if (!liveToken) return;
    setStage("live");
    logRef.current = [{ id: "open", role: "system", text: t("v.connecting"), time: formatTime() }];
    setMessages(logRef.current);
    transcriptRef.current = "";
    recentAdvisorPhrasesRef.current = [];
    sessionReadyRef.current = false;
    nextTimeRef.current = 0;
    resampleRef.current = newResampleState();
    activeSourcesRef.current = [];
    speakerEndTimeRef.current = 0;
    isAdvisorSpeakingRef.current = false;
    lastAdvisorSpokeTimeRef.current = 0;

    // Before the mic prompt: this still runs inside the click that started the
    // session, which is the context a wake lock request wants.
    requestWakeLock();

    try {
      // 1. Microphone capture with audio enhancements
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 16000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      console.log("[voice] Mic stream access granted");

      // 2. Playback audio context, asked for at the rate the advisor's PCM
      // arrives in so the graph does no resampling at all and Chrome's own
      // continuous resampler converts to the device rate once, for the stream,
      // rather than per node. Android builds may reject the option or ignore
      // it, so nothing downstream assumes it took: playPcmDirect reads
      // ctx.sampleRate back and resamples itself when they disagree.
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let playCtx: AudioContext;
      try {
        playCtx = new AudioCtxClass({ sampleRate: ADVISOR_PCM_RATE });
      } catch {
        playCtx = new AudioCtxClass();
      }
      if (playCtx.state === "suspended") {
        await playCtx.resume();
      }
      playCtxRef.current = playCtx;
      console.log("[voice] Playback AudioContext sampleRate:", playCtx.sampleRate);

      // 3. Mic capture audio context
      const micCtx = new AudioCtxClass();
      if (micCtx.state === "suspended") {
        await micCtx.resume();
      }
      micCtxRef.current = micCtx;
      const micSampleRate = micCtx.sampleRate;
      console.log("[voice] Mic AudioContext sampleRate:", micSampleRate);

      const source = micCtx.createMediaStreamSource(stream);

      // Dedicated controllable GainNode for instantaneous hardware-level muting
      const micGain = micCtx.createGain();
      micGain.gain.value = 1;
      micGainRef.current = micGain;
      source.connect(micGain);

      // 4. Connect ultra-low latency AudioWorklet / ScriptProcessor
      let useWorklet = false;
      if (micCtx.audioWorklet) {
        try {
          const workletUrl = getWorkletUrl();
          await micCtx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);
          const workletNode = new AudioWorkletNode(micCtx, "mic-processor");

          workletNode.port.onmessage = (e: MessageEvent) => {
            const { audio, level } = e.data;
            const isMuted =
              isAdvisorSpeakingRef.current ||
              (playCtxRef.current && playCtxRef.current.currentTime < speakerEndTimeRef.current) ||
              Date.now() - lastAdvisorSpokeTimeRef.current < 400;

            if (!isMuted) {
              setMicLevel(Math.min(1, level * 7));
              if (audio instanceof Float32Array) {
                const pcm16 = downsampleAndConvertToInt16(audio, micSampleRate, 16000);
                safeSendAudio(pcm16);
              }
            } else {
              setMicLevel(0);
            }
          };

          micGain.connect(workletNode);
          const silentGain = micCtx.createGain();
          silentGain.gain.value = 0;
          workletNode.connect(silentGain);
          silentGain.connect(micCtx.destination);
          useWorklet = true;
          console.log("[voice] Low-latency AudioWorklet active at", micSampleRate, "Hz");
        } catch (err) {
          console.warn("[voice] AudioWorklet setup failed, using ScriptProcessor fallback:", err);
        }
      }

      if (!useWorklet) {
        console.log("[voice] Using ScriptProcessorNode pipeline");
        const processor = micCtx.createScriptProcessor(1024, 1, 1);
        processor.onaudioprocess = (e) => {
          const isMuted =
            isAdvisorSpeakingRef.current ||
            (playCtxRef.current && playCtxRef.current.currentTime < speakerEndTimeRef.current) ||
            Date.now() - lastAdvisorSpokeTimeRef.current < 400;

          if (!isMuted) {
            const f32 = e.inputBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < f32.length; i++) sum += Math.abs(f32[i]);
            setMicLevel(Math.min(1, (sum / f32.length) * 7));
            const pcm16 = downsampleAndConvertToInt16(f32, micSampleRate, 16000);
            safeSendAudio(pcm16);
          } else {
            setMicLevel(0);
          }
        };
        micGain.connect(processor);
        const silentGain = micCtx.createGain();
        silentGain.gain.value = 0;
        processor.connect(silentGain);
        silentGain.connect(micCtx.destination);
      }

      // The user's speech is transcribed by Gemini itself — the session sets
      // inputAudioTranscription and onmessage below reads
      // serverContent.inputTranscription, which is what builds both the visible
      // transcript and the text the extraction step parses.
      //
      // A second, local Web Speech API recognizer used to run alongside it for
      // slightly faster interim text. It cost more than it bought. Android
      // Chrome plays a system chime on every start()/abort(), and the advisor's
      // playback had to abort it on each turn and restart it afterwards — an
      // audible beep on every exchange on Honor and Pixel handsets, where those
      // chimes ring at notification volume. It also opened a second microphone
      // capture competing with the one feeding the socket. Desktop Chrome plays
      // the chime quietly, which is why this survived so long.
      //
      // There is no API to silence the chime, so the fix is to not open the
      // recognizer. Server transcription already streams in incrementally, so
      // the transcript still fills in as the user speaks.

      // --- Build system prompt ---
      const isBm = lang === "bm";
      const systemPrompt = isBm
        ? [
            "Anda adalah penasihat AI untuk panduan keputusan EV vs Hibrid Malaysia.",
            "Tanya pengguna tepat 11 soalan, satu demi satu, dalam urutan ini:",
            "",
            "1. Berapa kilometer anda memandu pada hari biasa?",
            "2. Berapa hari seminggu anda biasanya memandu?",
            "3. Berapa kerap anda memandu perjalanan jauh melebihi 100 km? (jarang / bulanan / mingguan)",
            "4. Ke mana destinasi perjalanan jauh anda biasanya? (Lembah Klang / utara / selatan / pantai timur / Malaysia timur)",
            "5. Bolehkah anda mengecas EV di rumah? (ya / tidak)",
            "6. Bolehkah anda juga mengecas di tempat kerja? (ya / tidak)",
            "7. Apakah poskod rumah anda? (5 digit)",
            "8. Adakah rumah anda di grid Semenanjung atau di Malaysia Timur, Sabah atau Sarawak?",
            "9. Lebih kurang berapa bil elektrik bulanan anda dalam RM? (sebut sifar jika tidak pasti)",
            "10. Berapakah bajet maksimum anda untuk kereta dalam RM?",
            "11. Adakah anda mempertimbangkan panel solar di rumah? (ya / tidak)",
            "",
            "PERATURAN:",
            "- Tanya SATU soalan pada satu masa. Tunggu jawapan pengguna.",
            "- Selepas setiap jawapan, sahkan secara ringkas apa yang anda dengar, kemudian tanya soalan seterusnya.",
            "- Pastikan respons pendek dan mesra.",
            "",
            "SELEPAS semua 11 soalan dijawab:",
            "1. Katakan: \"Biar saya sahkan semua jawapan anda.\"",
            "2. Bacakan setiap jawapan dengan jelas.",
            "3. Tanya: \"Adakah semuanya betul? Katakan ya untuk sahkan, atau beritahu saya apa yang ingin diubah.\"",
            "4. Jika pengguna kata ya/sahkan/betul → mesej TERAKHIR anda mestilah tepat: INTERVIEW_COMPLETE",
            "5. Jika pengguna ingin ubah jawapan → kemas kini dan sahkan semula.",
            "",
            "PENTING: Apabila disahkan, tamatkan dengan tepat perkataan ini sahaja: INTERVIEW_COMPLETE",
          ].join("\n")
        : [
            "You are the AI interviewer for a Malaysian EV vs Hybrid decision guide.",
            "Ask the user exactly 11 questions, one at a time, in this order:",
            "",
            "1. How many kilometres do you drive on a typical day?",
            "2. How many days a week do you usually drive?",
            "3. How often do you take long trips over 100 km? (rarely / monthly / weekly)",
            "4. Where do your long trips usually go? (Klang Valley / north / south / east coast / east Malaysia)",
            "5. Can you charge an EV at home? (yes / no)",
            "6. Can you also charge at your workplace? (yes / no)",
            "7. What is your home postcode? (5 digits)",
            "8. Is your home on the Peninsular grid, or in East Malaysia — Sabah or Sarawak?",
            "9. Roughly what is your monthly electricity bill in ringgit? (say zero if unsure)",
            "10. What is your maximum budget for the car, in ringgit?",
            "11. Are you considering solar panels at home? (yes / no)",
            "",
            "RULES:",
            "- Ask ONE question at a time. Wait for the user's answer.",
            "- After each answer, briefly confirm what you heard, then ask the next question.",
            "- Keep responses short and conversational.",
            "",
            "AFTER all 11 questions are answered:",
            "1. Say: \"Let me confirm all your answers.\"",
            "2. Read back each answer clearly.",
            "3. Ask: \"Is everything correct? Say yes to confirm, or tell me what to change.\"",
            "4. If user says yes/confirm/correct → your VERY LAST message must be exactly: INTERVIEW_COMPLETE",
            "5. If user wants changes → update and re-confirm.",
            "",
            "IMPORTANT: When confirmed, end with exactly this word and nothing else: INTERVIEW_COMPLETE",
          ].join("\n");

      // --- Import SDK and connect ---
      console.log("[voice] Importing @google/genai...");
      const { GoogleGenAI, Modality } = await import("@google/genai");
      console.log("[voice] Creating client...");

      const client = new GoogleGenAI({
        apiKey: liveToken,
        httpOptions: { apiVersion: liveApiVersion },
      });

      console.log("[voice] Connecting to Live API...", { model: liveModel, apiVersion: liveApiVersion });
      const session = await client.live.connect({
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: liveVoice || "Puck" } } },
          systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
        },
        callbacks: {
          onopen: () => {
            console.log("[voice] ✓ WebSocket connection opened");
            sessionReadyRef.current = true;
            // one status line, not two: promote the seeded "connecting" row in
            // place. The previous pushMsg appended a second system message and
            // built its text by concatenating English, which BM never saw.
            logRef.current = promoteStatus(logRef.current, t("v.liveT"), formatTime());
            setMessages(logRef.current);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onmessage: (m: any) => {
            // 0. Barge-in. The server reports the turn was interrupted; the
            //    audio it already sent is ours to throw away.
            if (m.serverContent?.interrupted) {
              console.log("[voice] interrupted — dropping queued advisor audio");
              stopPlayback();
              return;
            }

            // 1. Incoming Audio Stream
            const parts = m.serverContent?.modelTurn?.parts ?? [];
            for (const p of parts) {
              if (p.inlineData?.mimeType?.startsWith("audio/") && p.inlineData.data) {
                handleIncomingPcm(p.inlineData.mimeType, p.inlineData.data);
              }
            }

            // 2. Server User Transcription (filtered for anti-echo)
            const uText = m.serverContent?.inputTranscription?.text;
            const isMuted =
              isAdvisorSpeakingRef.current ||
              (playCtxRef.current && playCtxRef.current.currentTime < speakerEndTimeRef.current) ||
              Date.now() - lastAdvisorSpokeTimeRef.current < 500;

            if (uText && uText.trim() && !isMuted) {
              const trimmed = uText.trim();
              if (!isEchoOfAdvisor(trimmed, recentAdvisorPhrasesRef.current)) {
                const last = logRef.current[logRef.current.length - 1];
                if (!last || last.role !== "user" || !last.text.toLowerCase().includes(trimmed.toLowerCase())) {
                  appendMsg("user", trimmed + " ");
                  transcriptRef.current += "User: " + trimmed + "\n";
                }
              }
            }

            // 3. Advisor Output Transcription (real-time streaming text)
            const outTransText = m.serverContent?.outputTranscription?.text;
            const visiblePartsText = parts
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((p: any) => !p.thought && p.text)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((p: any) => p.text)
              .join("");
            const gText = outTransText || visiblePartsText;

            if (gText && gText.trim()) {
              const trimmed = gText.trim();
              recentAdvisorPhrasesRef.current.push(trimmed);
              if (recentAdvisorPhrasesRef.current.length > 50) {
                recentAdvisorPhrasesRef.current.shift();
              }
              appendMsg("advisor", trimmed + " ");
              transcriptRef.current += "Advisor: " + trimmed + "\n";
              console.log("[voice] Advisor speech:", trimmed.substring(0, 80));

              if (trimmed.includes("INTERVIEW_COMPLETE") || transcriptRef.current.includes("INTERVIEW_COMPLETE")) {
                console.log("[voice] INTERVIEW_COMPLETE detected");
                extractAndFinish(transcriptRef.current);
              }
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onerror: (e: any) => {
            const detail = e instanceof ErrorEvent ? e.message : (e?.message || "unknown");
            console.error("[voice] Session error:", detail);
            setError(`Live session error: ${detail}`);
            setStage("fallback");
          },
          onclose: () => {
            console.log("[voice] Session closed");
            sessionReadyRef.current = false;
            nextTimeRef.current = 0;
            resampleRef.current = newResampleState();
            if (stageRef.current === "live") {
              if (transcriptRef.current.length > 20) {
                extractAndFinish(transcriptRef.current);
              } else {
                setError(t("v.errSession"));
                setStage("fallback");
              }
            }
          },
        },
      });

      sessionRef.current = session;
      sessionReadyRef.current = true;
      console.log("[voice] Session ready, sending initial greeting prompt...");

      const initialGreeting = isBm
        ? "Perkenalkan diri anda secara ringkas sebagai Penasihat AI VoltPilot. Sapa pengguna, beritahu mereka anda akan bertanya 11 soalan pantas untuk membantu memilih antara EV atau hibrid, kemudian terus tanya soalan pertama: Berapa kilometer anda memandu pada hari biasa?"
        : "Introduce yourself briefly as the VoltPilot AI Advisor. Greet the user, tell them you will ask 11 quick questions to help decide between an EV or hybrid, then immediately ask the first question: How many kilometres do you drive on a typical day?";

      session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ text: initialGreeting }],
          },
        ],
        turnComplete: true,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("[voice] Start failed:", detail);
      if (detail.includes("Permission denied") || detail.includes("NotAllowedError")) {
        setError(t("v.errMic"));
      } else {
        setError(`${t("v.errUnreachable")} (${detail})`);
      }
      setStage("fallback");
    }
  };

  return (
    <main className="app-shell thumb-zone-safe mx-auto flex min-h-[100svh] w-full max-w-lg flex-col px-4 sm:px-6 pt-6 bg-[#f6f5ee]">
      {/* Header */}
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-ink transition-colors flex items-center gap-1.5">
          ← {t("v.back")}
        </Link>
        <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Radio className="h-3.5 w-3.5 animate-pulse text-primary" /> {t("v.voice")}
        </span>
      </header>

      {/* Main Content Area */}
      <section className="flex-1 mt-4 flex flex-col">
        <h1 className="apple-display-2 mt-2 text-[26px] sm:text-[30px] text-ink leading-tight">
          {t("v.t1")} <span className="text-primary">{t("v.t2")}</span>
        </h1>

        {/* Checking Stage */}
        {stage === "checking" && (
          <Card className="mt-6 p-6 text-center border-line">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-[16px] text-muted">{t("v.checking")}</p>
          </Card>
        )}

        {/* Ready Stage */}
        {stage === "ready" && (
          <Card className="mt-6 border-none text-center bg-white shadow-xs p-6 sm:p-8">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary/10 shadow-[0_0_0_8px_rgba(0,102,204,0.06)]">
              <Mic className="h-9 w-9 text-primary animate-pulse" />
            </div>
            <h2 className="apple-display-2 mt-5 text-[20px] text-ink">{t("v.readyT")}</h2>
            <p className="mx-auto mt-2 max-w-[280px] text-[15px] sm:text-[16px] leading-relaxed text-muted">
              {t("v.readyB")}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200/60">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t("v.echo")}</span>
            </div>
          </Card>
        )}

        {/* Live Conversation Stage */}
        {stage === "live" && (
          <div className="mt-4 flex flex-col flex-1 rounded-2xl border border-line bg-white shadow-sm overflow-hidden min-h-[420px] max-h-[62vh]">
            {/* Live Header Bar with Voice Status */}
            <div className="flex items-center justify-between border-b border-line bg-slate-50/80 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className={`relative grid h-8 w-8 place-items-center rounded-full ${isAdvisorSpeaking ? "bg-primary/15 text-primary" : "bg-red-500/10 text-red-500"}`}>
                  <span className={`absolute inset-0 rounded-full ${isAdvisorSpeaking ? "animate-ping bg-primary/20" : "animate-ping bg-red-500/25"}`} />
                  {isAdvisorSpeaking ? <Volume2 className="relative h-4 w-4 text-primary animate-pulse" /> : <Mic className="relative h-4 w-4 text-red-500" />}
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-ink flex items-center gap-1.5">
                    {isAdvisorSpeaking ? "AI Advisor speaking · Mic muted" : "Listening to your voice..."}
                  </p>
                  <p className="text-[11px] text-muted">
                    {isAdvisorSpeaking ? "Mic un-mutes automatically when AI finishes" : "Speak naturally in English or BM"}
                  </p>
                </div>
              </div>

              {/* Real-time Mic Level Meters / Mute Indicator */}
              <div className="flex items-center gap-1 bg-white px-2 py-1.5 rounded-lg border border-line" title={isAdvisorSpeaking ? "Microphone Auto-Muted" : "Microphone Active"}>
                {isAdvisorSpeaking ? (
                  <span className="text-[10px] font-semibold text-amber-600 px-1">Muted</span>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
                    {[0.08, 0.2, 0.35, 0.5, 0.65].map((threshold, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-full transition-all duration-75"
                        style={{
                          height: micLevel > threshold ? `${10 + i * 3}px` : "6px",
                          backgroundColor: micLevel > threshold ? (i > 3 ? "#ef4444" : "#10b981") : "#e2e8f0",
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Conversation Messages Stream */}
            <div
              ref={scrollRef}
              className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#faf9f5]/50 scroll-smooth"
            >
              {messages.map((m) => {
                const isAdvisor = m.role === "advisor";
                const isUser = m.role === "user";
                const isSystem = m.role === "system";

                if (isSystem) {
                  return (
                    <div key={m.id} className="flex justify-center my-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-primary" /> {m.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold shadow-xs">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={`relative max-w-[84%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-2xs ${
                        isAdvisor
                          ? "bg-white border border-line text-ink rounded-bl-xs"
                          : m.isInterim
                          ? "bg-primary/85 text-white/95 rounded-br-xs italic"
                          : "bg-primary text-white rounded-br-xs"
                      }`}
                    >
                      <div className="mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isUser ? "text-white/80" : "text-primary"}`}>
                          {isUser ? t("v.you") : t("v.advisor")} {m.isInterim && "(speaking...)"}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    </div>

                    {isUser && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Streaming active indicator */}
              {isAdvisorSpeaking && (
                <div className="flex items-center gap-1.5 text-xs text-primary font-medium py-1 px-2">
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-ping" />
                  <span className="text-[11px]">{t("v.speaking")}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Extracting Stage */}
        {stage === "extracting" && (
          <Card className="mt-8 text-center p-8">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h3 className="mt-4 font-semibold text-ink text-base">{t("v.processing")}</h3>
            <p className="mt-1 text-[15px] text-muted">{t("v.extracting")}</p>
          </Card>
        )}

        {/* Done Stage */}
        {stage === "done" && (
          <Card className="mt-8 text-center p-8">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-ink text-base">{t("v.done")}</h3>
            <p className="mt-1 text-[15px] text-muted">{t("v.doneSub")}</p>
          </Card>
        )}

        {/* Fallback Stage */}
        {stage === "fallback" && (
          <div className="mt-6 space-y-4">
            <Card className="border-warning/30 bg-[#fff9ec] p-5">
              <p className="text-sm font-semibold text-warning">{t("v.fallbackT")}</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
            </Card>
            <Link href="/interview/form" className="block">
              <Button size="lg" className="w-full">
                <PenLine className="h-5 w-5 mr-2" /> {t("v.useform")}
              </Button>
            </Link>
          </div>
        )}
      </section>

      {/* Thumb-zone Action Controls */}
      <div className="thumb-zone mx-auto w-full max-w-lg mt-4">
        {stage === "ready" && (
          <div className="space-y-2.5">
            <Button size="lg" className="w-full font-semibold shadow-sm" variant="accent" onClick={startLive}>
              <Mic className="h-5 w-5 mr-2" /> {t("v.start")}
            </Button>
            <Link href="/interview/form" className="block">
              <Button size="lg" className="w-full" variant="outline">
                <PencilLine className="h-5 w-5 mr-2" /> {t("v.useform")}
              </Button>
            </Link>
          </div>
        )}
        {stage === "live" && (
          <Link href="/interview/form" className="block">
            <Button size="lg" className="w-full" variant="outline">
              <PencilLine className="h-5 w-5 mr-2" /> {t("v.useform")}
            </Button>
          </Link>
        )}
        {(stage === "checking" || stage === "extracting" || stage === "done") && <div className="h-12" />}
      </div>
    </main>
  );
}
