"use client";

export const runtime = "edge";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BatteryWarning, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { apiService } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Msg = { role: "user" | "ai"; text: string };

export default function ChatPage() {
  const t = useT();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // honor ?ask=battery deep link
  const askDefault = useRef(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ask") === "battery",
  );

  useEffect(() => {
    const greeting =
      "Hi! I'm your AI analyst. Ask me anything about your results — pricing, charging, battery degradation, or the roadmap. (Malay works too.)";
    const starter: Msg[] = [{ role: "ai", text: greeting }];
    if (askDefault.current) {
      starter.push({ role: "user", text: "How much does battery degradation matter for my EV?" });
    }
    setMessages(starter);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await apiService.postChat(token, q, "en");
      setMessages((m) => [...m, { role: "ai", text: r.reply || "" }]);
    } catch (e: any) {
      setError("The analyst is offline right now — try again in a moment.");
      setBusy(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell flex h-[100svh] flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white/80 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-none text-ink">{t("ch.title")}</p>
            <p className="mt-0.5 text-[11px] text-muted">{t("ch.sub")}</p>
          </div>
        </div>
        <Link href={`/results/${token}`} className="text-[13px] text-muted transition-colors hover:text-ink">
          {t("ch.results")}
        </Link>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-[18px] px-4 py-3 text-[14px] leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-white rounded-br-[6px]"
                  : "border border-border bg-parchment text-ink rounded-bl-[6px]"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 px-1 text-[13px] text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Thinking…
          </div>
        )}
        {error && <p className="px-1 text-sm font-medium text-destructive">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* quick chips */}
      <div className="flex gap-2 overflow-x-auto px-5 pb-2 no-scrollbar">
        {(["ch.q1", "ch.q2", "ch.q3", "ch.q4"] as const).map((k) => {
          const chip = t(k);
          return (
          <button
            key={k}
            onClick={() => send(chip)}
            className="shrink-0 rounded-full border border-primary/25 bg-primary/[0.04] px-4 py-2 text-[13px] font-medium text-primary active:bg-primary/10 tap-target"
          >
            {chip}
          </button>
          );
        })}
      </div>

      <div className="thumb-zone w-auto border-t border-border/60 px-5 pt-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            placeholder={t("ch.placeholder")}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-32 min-h-[48px] flex-1 resize-none rounded-[18px] border border-border bg-parchment px-4 py-3 text-[15px] text-ink outline-none placeholder:text-[#c7c7cc] focus:border-primary"
          />
          <Button
            size="lg"
            aria-label={t("ch.send")}
            disabled={!input.trim() || busy}
            onClick={() => send()}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        <p className="py-2 text-center text-[11px] text-muted">
          <BatteryWarning className="mr-1 inline h-3 w-3 text-warning" />
          Battery answers are education, not a change to your ranking.
        </p>
      </div>
    </main>
  );
}