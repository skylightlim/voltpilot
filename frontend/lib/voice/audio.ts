/**
 * Microphone capture and PCM plumbing for the live voice interview.
 *
 * Moved verbatim out of app/interview/voice/page.tsx, which held audio, the
 * Gemini session and the UI in one 1,066-line file. These functions touch no
 * React state, so out here they are unit-testable — and the resampler in
 * particular is the kind of arithmetic that fails silently rather than loudly.
 */

// Ultra-low latency AudioWorklet. 480 samples, not 512: at the usual 48kHz mic
// rate 480 resamples to exactly 160 samples at 16kHz, whereas 512 gives 170.667
// which rounds to 171 — declaring 16000Hz while actually sending 16031Hz. That
// 0.195% overspeed accumulated roughly a quarter-second of buffer at the far end
// every two minutes, so replies drifted later the longer the call ran.
// 480 is also 10.0ms exactly, marginally tighter than 10.67ms.
const WORKLET_CODE = `
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(480);
    this.bufferIndex = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const channelData = input[0];
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        const val = channelData[i];
        sum += Math.abs(val);
        this.buffer[this.bufferIndex++] = val;
        if (this.bufferIndex >= this.buffer.length) {
          const chunk = new Float32Array(this.buffer);
          this.port.postMessage({ audio: chunk, level: sum / channelData.length }, [chunk.buffer]);
          this.buffer = new Float32Array(480);
          this.bufferIndex = 0;
          sum = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("mic-processor", MicProcessor);
`;

export function getWorkletUrl() {
  return URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
}

export // Resamples Float32 audio from input sample rate to 16000Hz Int16 PCM
function downsampleAndConvertToInt16(
  input: Float32Array,
  inputRate: number,
  outputRate: number = 16000
): Int16Array {
  if (inputRate === outputRate) {
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  }

  const ratio = inputRate / outputRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetInput = 0;

  while (offsetResult < newLength) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      sum += input[i];
      count++;
    }
    const val = count > 0 ? sum / count : (input[offsetInput] || 0);
    const s = Math.max(-1, Math.min(1, val));
    result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7fff;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }

  return result;
}

export // Convert Int16Array PCM to base64 string
function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const len = bytes.byteLength;
  const chunk = 8192;
  for (let i = 0; i < len; i += chunk) {
    const end = Math.min(i + chunk, len);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(bytes[j]);
    }
  }
  return btoa(binary);
}
