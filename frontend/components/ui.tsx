import * as React from "react";
import Link from "next/link";
import { setLang, useLang, useT, type Lang } from "@/lib/i18n";
import { Sparkles, Globe, X, ArrowUpRight } from "lucide-react";

/* --------------------------------------------------------------------------
   VoltPilot Malaysia UI Primitives
   Hairline structure, crisp typography, and tactile press micro-interactions.
   -------------------------------------------------------------------------- */

export function Button({
  children,
  variant = "primary",
  size = "lg",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "ghost" | "outline" | "destructive" | "dark" | "solar";
  size?: "sm" | "md" | "lg" | "icon";
}) {
  const base =
    "pressable tap-target inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.015em] transition-[background-color,color,border-color,box-shadow] duration-200 disabled:opacity-40 disabled:pointer-events-none select-none cursor-pointer";

  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover shadow-sm",
    secondary: "border border-border bg-white text-ink hover:bg-paper-2 hover:border-line-strong active:bg-parchment shadow-sm",
    accent: "bg-ink text-white hover:bg-primary active:bg-primary shadow-sm",
    ghost: "bg-transparent text-primary hover:bg-pine-tint active:bg-pine-tint/80",
    outline: "border border-primary/30 text-primary bg-transparent hover:bg-pine-tint/60 active:bg-pine-tint",
    dark: "bg-tile-2 text-white hover:bg-tile-3 border border-white/10 active:bg-obsidian shadow-sm",
    destructive: "bg-destructive text-white hover:bg-[#991b1b] active:bg-[#991b1b] shadow-sm",
    solar: "bg-amber text-white hover:bg-[#b45309] active:bg-[#b45309] shadow-sm",
  };

  const sizes = {
    sm: "h-9 px-4 text-[13px]",
    md: "h-11 px-5 text-[14px]",
    lg: "h-12 px-6 text-[15px] sm:text-[16px]",
    icon: "h-10 w-10 p-0 rounded-full",
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  tone = "light",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "dark" | "tile" | "recessed" | "white";
  onClick?: () => void;
}) {
  const tones = {
    light: "bg-card border-line card-highlight text-ink",
    white: "bg-white border-line card-highlight text-ink",
    recessed: "bg-parchment border-line text-ink",
    dark: "bg-pine-deep border-white/10 dark-card-highlight text-white",
    tile: "bg-tile border-white/10 dark-card-highlight text-white",
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-[22px] border ${tones[tone]} transition-all duration-200 ${onClick ? "cursor-pointer pressable hover:border-line-strong" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "default" | "ev" | "hybrid" | "solar" | "warn" | "infra" | "dark" | "emerald";
  className?: string;
}) {
  const tones = {
    default: "bg-pine-tint text-pine border border-pine/15",
    ev: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    hybrid: "bg-slate-100 text-slate-800 border border-slate-200",
    solar: "bg-amber-tint text-amber-900 border border-amber-300/60",
    warn: "bg-red-50 text-red-800 border border-red-200",
    infra: "bg-cyan-50 text-cyan-800 border border-cyan-200",
    emerald: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
    dark: "bg-white/10 text-white/90 border border-white/15",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-semibold tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function DataMetricTile({
  label,
  value,
  subtext,
  delta,
  icon,
  tone = "light",
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  delta?: { text: string; positive?: boolean };
  icon?: React.ReactNode;
  tone?: "light" | "dark" | "white";
  className?: string;
}) {
  const isDark = tone === "dark";
  return (
    <div
      className={`rounded-[20px] border p-5 ${
        isDark
          ? "bg-tile-2 border-white/10 text-white dark-card-highlight"
          : "bg-white border-line card-highlight text-ink"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`mono-label ${isDark ? "text-white/60" : "text-fog"}`}>{label}</p>
        {icon && <div className={isDark ? "text-emerald-400" : "text-primary"}>{icon}</div>}
      </div>
      <p className={`figure mt-2.5 text-[28px] sm:text-[32px] font-bold ${isDark ? "text-white" : "text-ink"}`}>
        {value}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        {subtext && (
          <p className={`text-[13px] leading-snug ${isDark ? "text-white/70" : "text-muted"}`}>{subtext}</p>
        )}
        {delta && (
          <span
            className={`text-xs font-semibold ${
              delta.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}

export function StepDots({
  total,
  current,
  className = "",
}: {
  total: number;
  current: number;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      className={`flex items-center justify-center gap-1.5 ${className}`}
      aria-label={t("ui.step", { n: current + 1, t: total })}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === current ? "w-7 bg-primary" : i < current ? "w-2 bg-primary/40" : "w-2 bg-line-strong/50"
          }`}
        />
      ))}
    </div>
  );
}

export function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={`mono-label text-fog ${className}`}>{children}</p>;
}

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const lang = useLang();
  return (
    <div
      role="group"
      aria-label="Language / Bahasa"
      className={`flex items-center gap-0.5 rounded-full border p-0.5 ${
        dark ? "border-white/20 bg-white/5" : "border-border bg-parchment/60"
      }`}
    >
      {(["en", "bm"] as const).map((l: Lang) => (
        <button
          key={l}
          aria-pressed={lang === l}
          aria-label={l === "en" ? "English" : "Bahasa Melayu"}
          onClick={() => setLang(l)}
          className={`h-7 rounded-full px-2.5 text-[12px] font-semibold transition-all duration-150 cursor-pointer ${
            lang === l
              ? "bg-primary text-white shadow-xs"
              : dark
              ? "text-white/60 hover:text-white"
              : "text-muted hover:text-ink"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Navbar({ dark = false }: { dark?: boolean }) {
  const t = useT();
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 10);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-all duration-200 ${
        dark
          ? "apple-nav border-border-dark"
          : scrolled
          ? "apple-white border-line shadow-xs"
          : "border-transparent bg-background/80 backdrop-blur-md"
      }`}
    >
      <nav className="mx-auto flex h-14 max-w-6xl flex-nowrap items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className={`flex shrink-0 items-center gap-2 font-display text-[18px] font-bold tracking-tight ${
            dark ? "text-white" : "text-ink"
          }`}
        >
          {/* two wordmarks: the white-text cut on the dark nav, the black-text
              cut on the light one — the mark itself is identical in both */}
          <img
            src={dark ? "/brand/voltpilot-wordmark-light.png" : "/brand/voltpilot-wordmark-dark.png"}
            alt="VoltPilot"
            className="h-7 w-auto"
          />
          <span className="hidden md:inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            MY 2026
          </span>
        </Link>

        <div className="hidden lg:flex items-center gap-6 text-[14px] font-medium">
          <a
            href="/#calculator"
            className={`${dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"} transition-colors`}
          >
            {t("calc.title")}
          </a>
          <a
            href="/#cars"
            className={`${dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"} transition-colors`}
          >
            {t("nav.cars")}
          </a>
          <a
            href="/#method"
            className={`${dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"} transition-colors`}
          >
            {t("nav.method")}
          </a>
        </div>

        <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
          <LangToggle dark={dark} />
          <Link
            href="/interview/voice"
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold border transition-colors ${
              dark
                ? "border-white/20 text-white hover:bg-white/10"
                : "border-border text-ink bg-white hover:bg-parchment"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t("nav.voice")}</span>
          </Link>
          <Link
            href="/interview/form"
            className="shrink-0 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-primary-hover active:scale-[0.97] shadow-xs"
          >
            <span className="sm:hidden">{t("nav.ctaShort")}</span>
            <span className="hidden sm:inline">{t("nav.cta")}</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function Footer({ dark = false }: { dark?: boolean }) {
  const t = useT();
  return (
    <footer
      className={`border-t ${
        dark ? "border-border-dark bg-obsidian text-white/80" : "border-line bg-parchment text-ink"
      }`}
    >
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight">
              <img
                src={dark ? "/brand/voltpilot-wordmark-light.png" : "/brand/voltpilot-wordmark-dark.png"}
                alt="VoltPilot"
                className="h-6 w-auto"
              />
              <p className={dark ? "text-white/70" : "text-muted"}>Malaysia</p>
            </div>
            <p className={`mt-3 text-[13px] leading-relaxed ${dark ? "text-white/60" : "text-fog"}`}>
              {t("ft.body1")}
            </p>
          </div>

          <div>
            <p className="mono-label pb-3 text-fog">{t("ft.product")}</p>
            <ul className="space-y-2.5 text-[14px]">
              <li>
                <a className="hover:underline text-ink/80 dark:text-white/80" href="/#calculator">
                  {t("calc.title")}
                </a>
              </li>
              <li>
                <a className="hover:underline text-ink/80 dark:text-white/80" href="/#cars">
                  {t("ft.cars")}
                </a>
              </li>
              <li>
                <a className="hover:underline text-ink/80 dark:text-white/80" href="/#method">
                  {t("ft.how")}
                </a>
              </li>
              <li>
                <a className="hover:underline text-emerald-700 dark:text-emerald-400 font-medium" href="/interview/voice">
                  {t("nav.voice")}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="mono-label pb-3 text-fog">{t("ft.company")}</p>
            <p className={`text-[13px] leading-relaxed ${dark ? "text-white/60" : "text-fog"}`}>
              {t("ft.body2")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-md border border-line bg-white/50 px-2 py-0.5 font-mono text-[10px] text-muted">
                JPJ Lampiran B
              </span>
              <span className="rounded-md border border-line bg-white/50 px-2 py-0.5 font-mono text-[10px] text-muted">
                TNB EV ToU
              </span>
              <span className="rounded-md border border-line bg-white/50 px-2 py-0.5 font-mono text-[10px] text-muted">
                184 Models
              </span>
            </div>
          </div>

          <div>
            <p className="mono-label pb-3 text-fog">{t("faq.label")}</p>
            <ul className="space-y-2.5 text-[14px]">
              <li>
                <a className="hover:underline text-ink/80 dark:text-white/80" href="/#faq">
                  {t("faq.q1")}
                </a>
              </li>
              <li>
                <a className="hover:underline text-ink/80 dark:text-white/80" href="/#faq">
                  {t("faq.q2")}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div
          className={`mt-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t pt-8 text-[12px] ${
            dark ? "border-white/10 text-white/50" : "border-line text-fog"
          }`}
        >
          <p>{t("ft.rights")}</p>
          <p className="max-w-xl text-left sm:text-right">{t("ft.disc")}</p>
        </div>
      </div>
    </footer>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 w-full ${maxWidth} enter-rise rounded-[24px] border border-line bg-white p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="text-[18px] font-bold text-ink font-display">{title}</div>
          <button
            onClick={onClose}
            className="tap-target -mr-2 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-parchment hover:text-ink transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}