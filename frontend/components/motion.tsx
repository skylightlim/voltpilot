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