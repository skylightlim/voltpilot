# VoltPilot — Design & Motion Contract

Source of truth for the frontend. `components/motion.tsx` cites this file; until now it
did not exist. If a decision here conflicts with a component, this file wins — change it
here first, then the code.

Locked in the design review of 2026-09-06. Reference site under discussion:
`https://www.icaur.com.my/` (borrowed for *motion*, explicitly not for identity — see §2).

---

## 1. Identity — PRESERVED, not replaced

The "field guide" system stays. It is deliberate and it is the reason the product reads as
impartial rather than promotional.

- **Surfaces** — bone paper `#f4f3ec`, raised `#fbfaf5`, recessed parchment `#e9e7d8`
- **Ink** — `#15221c` green-black; muted `#5c6b62` (4.5:1 on paper)
- **Brand** — pine `#1c4a3a`; amber signal `#c97f10`
- **Type** — Space Grotesk display (`--font-display`), mono for all figures
- **Structure** — hairline rules, not card soup. Shape rule: pills for buttons/chips,
  14px inputs, 20px cards.
- **Theme** — light is locked. The 3D analysis scene is the one dark route.

## 2. Why we did NOT adopt the reference site's look

iCAUR is a manufacturer marketing two of its own cars. VoltPilot ranks 184 trims —
iCAUR's included — and also runs sponsor slots (`ad_sponsors.json`, `PartnerMarquee`).
Dressing an impartial ranking engine in a car brand's brochure aesthetic invites the
question of who paid for the ranking.

**Borrowed:** scroll choreography, spatial confidence, big-type marquee bands, pacing.
**Rejected:** monochrome automotive palette, hero-car brochure framing, brand swagger.

## 3. Motion doctrine

Superseded rule: the old "no gimmicks, fade once, done" posture. Motion is now a
first-class part of the page — but *scrub-linked*, not decorative.

**The distinction that matters:** existing `Reveal` fires once (`once: true`) and is over.
Scrub binds animation position continuously to scroll offset. "Elements change as you
scroll" means scrub.

### Permitted
- Scroll-linked parallax on imagery and background bands
- Scrub-driven counters and figure roll-ups
- Mask / clip-path reveals tied to scroll progress
- Horizontal marquee bands driven by scroll velocity
- Existing fire-once `Reveal` / `Stagger` where a one-shot entrance is right

### Forbidden
- **Pinned sections.** No `ScrollTrigger.pin`, no scroll-jacking, no `scroller-proxy`
  smooth-scroll hijack. Decided explicitly: the page must scroll at native speed.
- New animation dependencies. GSAP 3.15 + ScrollTrigger are installed and registered;
  they are sufficient.
- New WebGL beyond the existing `/analysis` scene.
- Animating anything but `transform` / `opacity` / `clip-path` in a scroll handler.

### Required
- Every scroll effect wrapped in `gsap.matchMedia()` with a
  `(prefers-reduced-motion: no-preference)` guard — the pattern already in `motion.tsx`.
- A reduced-motion user sees final state immediately, never a blank band.
- No content may depend on JS to become visible. Scrub *enhances* laid-out content;
  it never gates it. (The reference site fails this: its unscrolled state is ~40% blank.)

## 4. Page length & conversion

The reference is 16,167px tall — ~18 screens — because scrolling *is* its product.
Ours is a funnel into a 9-step interview, so scroll before the CTA is drop-off.

- Landing caps at **~8–10 screens**.
- Primary CTA **above the fold**. Second CTA mid-page.
- Scroll choreography lives **after** the first CTA, never in front of it.

## 5. Scope

**In scope now** — presentation surfaces, no backend coupling:
`/` · `/analysis` · `/sliders` · `/results/[token]`

**Deferred** — token- and API-coupled funnel internals. Restyle shells only, never touch
session logic: `/interview/voice` (1,066 lines, live Gemini audio), `/interview/form`,
`/chat/[token]`, `/recommendation/[token]`, `/intake/[step]`

## 6. Hard constraints

- **Mobile-first, 375px base.** Touch targets ≥44px. Thumb-zone CTAs.
  Desktop is the enhancement, not the design target.
- **Bilingual parity.** Every new string lands in `lib/i18n.ts` as `[EN, BM]` or it does
  not ship. Malay runs ~15–20% longer — layouts must not assume English width.
- **Budget.** No new runtime deps. `framer-motion` removed (was imported nowhere).
  `three` + `@react-three/fiber` stay, `dynamic()`-imported on `/analysis` only —
  `/` must never pull them.

## 7. Data claims

The catalog is **184 trims** (`data/catalog_vehicles.json` → `vehicles[]`). Copy across
`app/` and `lib/i18n.ts` says 184 and is correct. The root `README.md` still says 23 —
the README is stale, not the UI.
