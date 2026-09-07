import * as React from "react";
import Link from "next/link";
import { setLang, useLang, useT, type Lang } from "@/lib/i18n";
import { Sparkles, Globe, X, ArrowUpRight } from "lucide-react";
import { Reveal, ScrubStagger } from "@/components/motion";

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
  size?: "sm" | "md" | "lg" | "xl" | "icon";
}) {
  const base =
    "group pressable tap-target inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-[480] tracking-[-0.005em] transition-[background-color,color,border-color,box-shadow] duration-200 disabled:opacity-40 disabled:pointer-events-none select-none cursor-pointer";

  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover shadow-sm hover:shadow-md",
    secondary: "border border-border bg-white text-ink hover:bg-paper-2 hover:border-line-strong active:bg-parchment shadow-sm",
    accent: "bg-ink text-white hover:bg-primary active:bg-primary shadow-sm",
    ghost: "bg-transparent text-primary hover:bg-pine-tint active:bg-pine-tint/80",
    outline: "border border-primary/30 text-primary bg-transparent hover:bg-pine-tint/60 active:bg-pine-tint",
    dark: "bg-tile-2 text-white hover:bg-tile-3 border border-white/10 active:bg-obsidian shadow-sm",
    destructive: "bg-destructive text-white hover:bg-[#991b1b] active:bg-[#991b1b] shadow-sm",
    solar: "bg-amber text-white hover:bg-[#b45309] active:bg-[#b45309] shadow-sm",
  };

  const sizes = {
    sm: "h-9 px-4 text-[14px]",
    md: "h-11 px-[18px] text-[15px]",
    lg: "h-12 px-5 text-[16px] sm:text-[17px]",
    xl: "h-14 px-7 text-[18px]",
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
      className={`rounded-lg border ${tones[tone]} transition-[background-color,border-color,box-shadow,color] duration-200 ${onClick ? "cursor-pointer pressable hover:border-line-strong" : ""} ${className}`}
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold tracking-[0.01em] ${tones[tone]} ${className}`}
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
      className={`rounded-lg border p-5 ${
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
          <p className={`text-[15px] leading-snug ${isDark ? "text-white/70" : "text-muted"}`}>{subtext}</p>
        )}
        {delta && (
          <span
            className={`text-xs font-semibold ${
              delta.positive ? "text-emerald-600" : "text-red-600"
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
          className={`hit-tall h-8 rounded-full px-3 text-[12px] font-semibold transition-all duration-150 cursor-pointer ${
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
          className={`flex shrink-0 items-center font-display text-[18px] font-bold tracking-tight ${
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
        </Link>

        <div className="hidden lg:flex flex-nowrap items-center gap-6 whitespace-nowrap text-[16px] font-medium">
          <a
            href="/#calculator"
            className={`${dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"} transition-colors`}
          >
            {t("nav.calc")}
          </a>
          <a
            href="/#cars"
            className={`${dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"} transition-colors`}
          >
            {t("nav.cars")}
          </a>
          <a
            href="/methodology"
            className={`${dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"} transition-colors`}
          >
            {t("nav.method")}
          </a>
        </div>

        <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
          <LangToggle dark={dark} />
          <Link
            href="/interview/voice"
            className={`hit-tall hidden h-10 shrink-0 whitespace-nowrap sm:inline-flex items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold border transition-colors ${
              dark
                ? "border-white/20 text-white hover:bg-white/10"
                : "border-border text-ink bg-white hover:bg-parchment"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            <span>{t("nav.voice")}</span>
          </Link>
          <Link
            href="/interview/form"
            className="hit-tall inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full bg-primary px-5 text-[15px] font-[480] text-white transition-all hover:bg-primary-hover active:scale-[0.97] shadow-xs"
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

        {/* Regulatory detail. DESIGN.md §1: hairline rules, not card soup — the
            figures are divided by rules, not boxed. Amber is the signal colour and is
            spent once, on the only figure that is a closing deadline. Motion is
            scrub-linked per §3, and every figure is in the DOM before JS runs.
            The figures deliberately do NOT use ScrubCount: a scrub-bound counter rests
            wherever the scroll left it, and a road-tax figure caught mid-count reads as
            a wrong number rather than an unfinished animation. Entrance motion here is
            opacity and transform only, which cannot render a false value. */}
        <div>
          <p className="mono-label text-fog">{t("ft.glance")}</p>
          <p
            className={`mt-2 max-w-[52ch] text-[15px] leading-relaxed ${
              dark ? "text-white/60" : "text-fog"
            }`}
          >
            {t("ft.regIntro")}
          </p>

          <ScrubStagger
            className={`mt-9 grid grid-cols-2 border-t lg:grid-cols-4 ${
              dark ? "border-white/10" : "border-line"
            }`}
            selector="> div"
            y={18}
            each={0.07}
          >
            {(
              [
                ["ft.s1v", "ft.s1l"],
                ["ft.s2v", "ft.s2l"],
                ["ft.s3v", "ft.s3l"],
                ["ft.s4v", "ft.s4l"],
              ] as const
            ).map(([figure, label], i) => (
              <div
                key={label}
                className={`border-b py-6 pr-6 lg:border-b-0 lg:py-7 ${
                  i % 2 === 1 ? "pl-6" : ""
                } lg:pl-6 lg:first:pl-0 ${
                  i % 2 === 1 ? "border-l" : ""
                } lg:border-l lg:first:border-l-0 ${
                  dark ? "border-white/10" : "border-line"
                }`}
              >
                <p
                  className={`figure text-[27px] leading-none ${
                    // The CKD window is the one fact with an expiry the reader must act
                    // on, so it carries the amber signal. Everything else stays pine.
                    label === "ft.s4l" ? "text-amber" : "text-primary"
                  }`}
                >
                  {t(figure)}
                </p>
                <p
                  className={`mt-2.5 max-w-[22ch] text-[13px] leading-snug ${
                    dark ? "text-white/55" : "text-fog"
                  }`}
                >
                  {t(label)}
                </p>
              </div>
            ))}
          </ScrubStagger>

          <Reveal className="mt-14 grid gap-x-14 gap-y-11 sm:grid-cols-2" y={18}>
            {(
              [
                ["ft.reg1t", "ft.p1", "ft.reg1"],
                ["ft.reg2t", "ft.p2", "ft.reg2"],
                ["ft.reg3t", "ft.p3", "ft.reg3"],
                ["ft.reg4t", "ft.p4", "ft.reg4"],
              ] as const
            ).map(([title, prov, body]) => (
              <div key={title}>
                <h3
                  className={`font-display text-[16px] font-semibold tracking-tight ${
                    dark ? "text-white/90" : "text-ink"
                  }`}
                >
                  {t(title)}
                </h3>
                <p className={`t-caption mt-1 ${dark ? "text-white/40" : "text-fog/80"}`}>
                  {t(prov)}
                </p>
                <p
                  className={`mt-3 max-w-[54ch] text-[14.5px] leading-relaxed ${
                    dark ? "text-white/60" : "text-fog"
                  }`}
                >
                  {t(body)}
                </p>
              </div>
            ))}
          </Reveal>

          <p className="mono-label mt-14 pb-4 text-fog">{t("ft.sources")}</p>
          {/* A ruled index. The name column is sized by the longest name via subgrid
              rather than a fixed width behind a breakpoint — below `sm` that fixed
              column switched off and every description started at a different x.
              Subgrid keeps all three columns aligned at any width. */}
          <ul
            className={`grid grid-cols-[max-content_1fr_auto] border-t ${
              dark ? "border-white/10" : "border-line"
            }`}
          >
            {(
              [
                ["JPJ", "https://www.jpj.gov.my/", "ft.srcJpj"],
                ["myTNB", "https://www.mytnb.com.my/tariff/index.html", "ft.srcTnb"],
                ["MITI", "https://www.miti.gov.my/", "ft.srcMiti"],
                [
                  "Suruhanjaya Tenaga",
                  "https://www.st.gov.my/resources/guidelines-electric-vehicle-charging-system-evcs",
                  "ft.srcSt",
                ],
                ["PLANMalaysia MEVnet", "https://www.planmalaysia.gov.my/mevnet/", "ft.srcPlan"],
              ] as const
            ).map(([name, href, label]) => (
              <li
                key={href}
                className={`col-span-3 grid grid-cols-subgrid border-b ${
                  dark ? "border-white/10" : "border-line"
                }`}
              >
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group col-span-3 grid min-h-12 grid-cols-subgrid items-center gap-x-5 py-3 text-[14px] transition-colors ${
                    dark ? "text-white/70 hover:text-white" : "text-ink/80 hover:text-primary"
                  }`}
                >
                  <span className="font-medium">{name}</span>
                  <span className={dark ? "text-white/45" : "text-fog"}>{t(label)}</span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 shrink-0 opacity-40 transition-transform duration-200 will-change-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-90 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className={`mt-16 border-t pt-14 ${dark ? "border-white/10" : "border-line"}`}>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight">
                <img
                  src={dark ? "/brand/voltpilot-wordmark-light.png" : "/brand/voltpilot-wordmark-dark.png"}
                  alt="VoltPilot"
                  className="h-6 w-auto"
                />
                <p className={dark ? "text-white/70" : "text-muted"}>Malaysia</p>
              </div>
              <p className={`mt-3 text-[15px] leading-relaxed ${dark ? "text-white/60" : "text-fog"}`}>
                {t("ft.body1")}
              </p>
            </div>

            <div>
              <p className="mono-label pb-3 text-fog">{t("ft.product")}</p>
              <ul className="space-y-2.5 text-[16px]">
                <li>
                  <a className="hover:underline text-ink/80" href="/#calculator">
                    {t("calc.title")}
                  </a>
                </li>
                <li>
                  <a className="hover:underline text-ink/80" href="/#cars">
                    {t("ft.cars")}
                  </a>
                </li>
                <li>
                  <a className="hover:underline text-ink/80" href="/methodology">
                    {t("ft.how")}
                  </a>
                </li>
                <li>
                  <a className="hover:underline text-emerald-700 font-medium" href="/interview/voice">
                    {t("nav.voice")}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="mono-label pb-3 text-fog">{t("ft.company")}</p>
              <p className={`text-[15px] leading-relaxed ${dark ? "text-white/60" : "text-fog"}`}>
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
                  {t("nav.modelCount")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Every disclaimer lives here, at the very bottom, rather than trailing the
            section each one happens to qualify. */}
        <div
          className={`mt-14 border-t pt-8 text-[12px] ${
            dark ? "border-white/10 text-white/50" : "border-line text-fog"
          }`}
        >
          <div className="grid max-w-[100ch] gap-2 leading-relaxed sm:grid-cols-2 sm:gap-x-12">
            <p>{t("ft.verified")}</p>
            <p>{t("ft.disc")}</p>
          </div>
          <p className={`mt-6 border-t pt-6 ${dark ? "border-white/10" : "border-line"}`}>
            {t("ft.rights")}
          </p>
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
  const t = useT();
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
        className={`relative z-10 w-full ${maxWidth} enter-rise rounded-lg border border-line bg-white p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="text-[18px] font-bold text-ink font-display">{title}</div>
          <button
            onClick={onClose}
            className="tap-target -mr-2 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-parchment hover:text-ink transition-colors cursor-pointer"
            aria-label={t("ui.closeDialog")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}