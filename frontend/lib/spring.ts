/**
 * Spring easing, authored the way motion.dev parameterises it.
 *
 * Motion's real insight is not the solver — it is the *parameters*. Classic
 * springs are specced as stiffness/damping/mass, which nobody can hold in their
 * head: "stiffness 320, damping 28" says nothing about what you will see. Motion
 * lets you write `bounce` (how much it overshoots) and `visualDuration` (when it
 * looks like it arrived), which are the two things a designer actually decides.
 * That model is what is borrowed here; the solver below is the ordinary closed
 * form for a damped harmonic oscillator.
 *
 * DESIGN.md §3 forbids new animation dependencies and §6 budgets against new
 * runtime deps, so `motion` itself is not installed — GSAP 3.13 already drives
 * every scroll effect on the site and accepts a plain function as an ease.
 *
 * Two consumers:
 *   - `springEase()`  -> (t: number) => number, for GSAP's `ease` option
 *   - `springLinear()` -> a CSS `linear()` string, for transitions that never
 *     touch JS (button press, slider thumb). This is the only way to get real
 *     spring motion out of a CSS transition; a cubic-bezier cannot overshoot
 *     and return.
 */

export type SpringOptions = {
  /** 0 = no overshoot (critically damped), 1 = very bouncy. Motion's default is 0.25. */
  bounce?: number;
  /** Samples in the generated `linear()` curve. More = smoother, longer string. */
  steps?: number;
};

/** Decay budget: how many e-foldings of the envelope fit in the tween's span.
 *  At 8, the residual at t=1 is e^-8 ~= 3.4e-4 — visually settled, so the
 *  endpoint correction below stays imperceptible. */
const DECAY = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Normalised spring position over t in [0, 1].
 *
 * `bounce` maps to the damping ratio as zeta = 1 - bounce, so bounce 0 is
 * critically damped and higher values ring. Angular frequency is then chosen so
 * the envelope has decayed by DECAY at t = 1, which is what makes the curve fit
 * whatever duration the caller gives it: the *shape* is set by bounce, the
 * *speed* by the duration on the tween or transition.
 */
export function springEase({ bounce = 0.25 }: SpringOptions = {}): (t: number) => number {
  const zeta = clamp(1 - bounce, 0.05, 1);
  const omega0 = DECAY / zeta;

  const raw =
    zeta >= 1
      ? // critically damped — no oscillation, fastest approach without overshoot
        (t: number) => 1 - Math.exp(-omega0 * t) * (1 + omega0 * t)
      : (() => {
          const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
          return (t: number) =>
            1 -
            Math.exp(-zeta * omega0 * t) *
              (Math.cos(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * t));
        })();

  // GSAP and CSS both require the curve to land exactly on 1, and the raw
  // solution only approaches it. Scaling by raw(1) would inflate the overshoot
  // slightly; adding the shortfall as a ramp leaves the bounce shape intact.
  const shortfall = 1 - raw(1);
  return (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : raw(t) + shortfall * t);
}

/**
 * The same curve as a CSS `linear()` easing string.
 *
 * `linear()` takes a list of sampled output values and interpolates between
 * them, which is how a CSS transition can be made to overshoot. Supported in
 * Chrome 113+, Safari 17.2+ and Firefox 112+; older browsers ignore the whole
 * declaration, so always author it with a plain fallback on the line above.
 */
export function springLinear({ bounce = 0.25, steps = 24 }: SpringOptions = {}): string {
  const ease = springEase({ bounce });
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(Number(ease(t).toFixed(4)).toString());
  }
  return `linear(${points.join(", ")})`;
}
