"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* Apple-style reveal motion (DESIGN.md: no gimmicks, ~0.6s ease-out, once) */

export const EASE_OUT = "power3.out";

/** Fade-and-rise a block into view once, when it enters the viewport. */
export function Reveal({
  children,
  className = "",
  y = 24,
  delay = 0,
  duration = 0.65,
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
  delay?: number;
  duration?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration,
          delay,
          ease: EASE_OUT,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        },
      );
    });
    return () => mm.revert();
  }, [y, delay, duration]);
  return (
    <div ref={ref} className={`[will-change:transform] ${className}`}>
      {children}
    </div>
  );
}

/** Stagger children (direct DOM children matched by `selector`) into view as a group. */
export function Stagger({
  children,
  className = "",
  selector = "> *",
  y = 20,
  stagger = 0.09,
  duration = 0.6,
}: {
  children: React.ReactNode;
  className?: string;
  selector?: string;
  y?: number;
  stagger?: number;
  duration?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sel = selector.startsWith("> ") ? selector.slice(2) : selector;
    const items =
      sel === "*"
        ? Array.from(el.children)
        : gsap.utils.toArray<HTMLElement>(sel, el);
    if (!items.length) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        items,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration,
          stagger,
          ease: EASE_OUT,
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        },
      );
    });
    return () => mm.revert();
  }, [selector, y, stagger, duration]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Rise text lines sequentially when the block scrolls in. */
export function TextReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const lines = el.querySelectorAll<HTMLElement>("[data-line]");
      if (!lines.length) return;
      gsap.fromTo(
        lines,
        { autoAlpha: 0, y: 14 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.1,
          delay,
          ease: EASE_OUT,
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
        },
      );
    });
    return () => mm.revert();
  }, [delay]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Number that counts up when scrolled into view. Reads `data-value`. */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.1,
  className = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (v: number) =>
      decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-MY");
    // paint the real value immediately: before the trigger fires (and as the
    // reduced-motion fallback) the span must never read 0 — the previous
    // tween-attached ScrollTrigger paused at v=0 whenever its cached start
    // went stale after the page layout settled, leaving "0 kg" on screen.
    el.textContent = `${prefix}${fmt(value)}${suffix}`;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const st = ScrollTrigger.create({
        trigger: el,
        start: "top 92%",
        once: true,
        onEnter: () => {
          const state = { v: 0 };
          gsap.to(state, {
            v: value,
            duration,
            ease: "power2.out",
            onUpdate: () => {
              el.textContent = `${prefix}${fmt(state.v)}${suffix}`;
            },
          });
        },
      });
      return () => st.kill();
    });
    return () => mm.revert();
  }, [value, prefix, suffix, decimals, duration]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString("en-MY")}
      {suffix}
    </span>
  );
}
/* ————————————————————————————————————————————————————————————————
   SCRUB-LINKED MOTION (DESIGN.md §3)

   The primitives above fire once and are done. These bind animation
   position continuously to scroll offset — scroll back up and they run
   backwards. That is the "elements change as you scroll" behaviour.

   Rules held by every component below:
     · no pinning, no scroll-jacking — the page scrolls at native speed
     · transform / opacity / clip-path only
     · content is laid out visible; GSAP applies the "from" state only
       once JS runs AND reduced-motion is not requested, so a no-JS or
       reduced-motion visitor sees the finished state, never a blank band
   ———————————————————————————————————————————————————————————————— */

/** Shared scrub window: element enters the viewport → element leaves. */
const SCRUB_SPAN = { start: "top bottom", end: "bottom top" } as const;

/**
 * Drift an element against the scroll as it crosses the viewport.
 * `distance` is total travel in px — positive drifts up (slower than scroll).
 */
export function Parallax({
  children,
  className = "",
  distance = 60,
  scrub = 0.8,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  scrub?: number | boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tw = gsap.fromTo(
        el,
        { y: distance / 2 },
        {
          y: -distance / 2,
          ease: "none",
          force3D: true,
          scrollTrigger: { trigger: el, ...SCRUB_SPAN, scrub },
        },
      );
      return () => tw.kill();
    });
    return () => mm.revert();
  }, [distance, scrub]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Wipe content in, bound to scroll progress rather than fired once.
 * Completes by the time the block sits ~65% up the viewport, so it reads
 * as "revealing" rather than "still loading".
 */
export function ScrubReveal({
  children,
  className = "",
  from = "bottom",
  y = 28,
  scrub = 0.6,
}: {
  children: React.ReactNode;
  className?: string;
  from?: "bottom" | "left" | "right";
  y?: number;
  scrub?: number | boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inset =
      from === "left"
        ? "inset(0% 100% 0% 0%)"
        : from === "right"
          ? "inset(0% 0% 0% 100%)"
          : "inset(18% 0% 0% 0%)";
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tw = gsap.fromTo(
        el,
        { clipPath: inset, autoAlpha: 0.15, y },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          autoAlpha: 1,
          y: 0,
          ease: "none",
          force3D: true,
          scrollTrigger: {
            trigger: el,
            start: "top 92%",
            end: "top 55%",
            scrub,
          },
        },
      );
      return () => tw.kill();
    });
    return () => mm.revert();
  }, [from, y, scrub]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Figure bound to scroll position: counts up as the reader scrolls in and
 * back down if they scroll away. Unlike `CountUp` this never latches.
 * Renders the true value in markup so no-JS and reduced-motion read correctly.
 */
export function ScrubCount({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (v: number) =>
      decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-MY");
    el.textContent = `${prefix}${fmt(value)}${suffix}`;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const state = { v: 0 };
      const tw = gsap.to(state, {
        v: value,
        ease: "none",
        onUpdate: () => {
          el.textContent = `${prefix}${fmt(state.v)}${suffix}`;
        },
        scrollTrigger: {
          trigger: el,
          start: "top 95%",
          end: "top 60%",
          scrub: 0.5,
        },
      });
      // leaving the scrub range upward must not strand a partial figure
      return () => {
        tw.kill();
        el.textContent = `${prefix}${fmt(value)}${suffix}`;
      };
    });
    return () => mm.revert();
  }, [value, prefix, suffix, decimals]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {decimals > 0 ? value.toFixed(decimals) : value.toLocaleString("en-MY")}
      {suffix}
    </span>
  );
}

/**
 * Big-type band that slides horizontally with scroll and leans into scroll
 * velocity. The marquee borrowed from the reference site — carrying a real
 * claim rather than brand noise.
 */
export function ScrollMarquee({
  children,
  className = "",
  distance = 320,
  repeat = 3,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  repeat?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const skew = gsap.quickTo(track, "skewX", { duration: 0.4, ease: "power3.out" });
      const tw = gsap.fromTo(
        track,
        { x: distance },
        {
          x: -distance,
          ease: "none",
          force3D: true,
          scrollTrigger: {
            trigger: el,
            ...SCRUB_SPAN,
            scrub: 0.7,
            onUpdate: (self) => {
              // velocity is px/s; clamp so a flick never shears the type apart
              skew(gsap.utils.clamp(-6, 6, self.getVelocity() / -280));
            },
          },
        },
      );
      return () => tw.kill();
    });
    return () => mm.revert();
  }, [distance]);
  return (
    <div ref={ref} className={`overflow-hidden ${className}`} aria-hidden="true">
      <div ref={trackRef} className="flex w-max items-center gap-10 whitespace-nowrap will-change-transform">
        {Array.from({ length: repeat }).map((_, i) => (
          <React.Fragment key={i}>{children}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * ScrollTrigger caches start/end positions at init. Fonts, images and the
 * dynamically-imported 3D scene all settle *after* that, which is what
 * stranded `CountUp` at zero before. Mount once per page that scrubs.
 */
export function ScrollRefresh() {
  React.useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    const t = window.setTimeout(refresh, 250);
    window.addEventListener("load", refresh);
    if (document.fonts?.ready) void document.fonts.ready.then(refresh);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("load", refresh);
    };
  }, []);
  return null;
}

/**
 * Grid children wipe in offset from one another, distributed across the
 * scroll range rather than fired on a single trigger. One ScrollTrigger for
 * the whole group — a 12-card grid costs one listener, not twelve.
 */
export function ScrubStagger({
  children,
  className = "",
  selector = "> *",
  y = 30,
  each = 0.09,
  scrub = 0.6,
}: {
  children: React.ReactNode;
  className?: string;
  selector?: string;
  y?: number;
  each?: number;
  scrub?: number | boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sel = selector.startsWith("> ") ? selector.slice(2) : selector;
    const items =
      sel === "*" ? Array.from(el.children) : gsap.utils.toArray<HTMLElement>(sel, el);
    if (!items.length) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tw = gsap.fromTo(
        items,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          ease: "none",
          force3D: true,
          stagger: each,
          scrollTrigger: { trigger: el, start: "top 88%", end: "top 38%", scrub },
        },
      );
      return () => tw.kill();
    });
    return () => mm.revert();
  }, [selector, y, each, scrub]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
