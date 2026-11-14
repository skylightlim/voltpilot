import katex from "katex";
import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import MethodologyView, { type TexRow } from "./MethodologyView";

export const metadata: Metadata = {
  title: "Method & sources",
  description:
    "How VoltPilot ranks Malaysian EVs and hybrids, the EV rules it works from, and every source behind the numbers.",
};

/* The TOPSIS equations, typeset by KaTeX here on the server so the page ships
   finished HTML (with MathML alongside, for screen readers) and the browser
   never downloads the library. A malformed equation fails the build rather
   than rendering as red error text.

   These are the arithmetic of run_topsis() and criteria_bounds() in
   backend/app/engines/topsis.py. Change one, change the other. */

const tex = (src: string) =>
  katex.renderToString(String.raw`\displaystyle ${src}`, {
    throwOnError: true,
    output: "htmlAndMathml",
  });

const EQUATIONS: { label: string; src: string }[] = [
  {
    label: "Scale to fixed bounds",
    src: String.raw`r_{ij} = \min\!\left(1,\ \max\!\left(0,\ \frac{x_{ij} - L_j}{U_j - L_j}\right)\right)`,
  },
  {
    label: "Point every criterion the same way",
    src: String.raw`\tilde{r}_{ij} = \begin{cases} r_{ij} & \text{higher is better} \\ 1 - r_{ij} & \text{lower is better} \end{cases}`,
  },
  {
    label: "Apply your weights",
    src: String.raw`v_{ij} = w_j\,\tilde{r}_{ij}, \qquad \sum_{j=1}^{5} w_j = 1`,
  },
  {
    label: "Ideal: the best end of every bound",
    src: String.raw`A^{+} = \left(w_1,\ w_2,\ \dots,\ w_5\right)`,
  },
  {
    label: "Anti-ideal: the worst end",
    src: String.raw`A^{-} = \left(0,\ 0,\ \dots,\ 0\right)`,
  },
  {
    label: "Distance to ideal",
    src: String.raw`D_i^{+} = \sqrt{\sum_{j=1}^{5} \left(v_{ij} - w_j\right)^2}`,
  },
  {
    label: "Distance to anti-ideal",
    src: String.raw`D_i^{-} = \sqrt{\sum_{j=1}^{5} v_{ij}^{\,2}}`,
  },
];

const MATH: TexRow[] = EQUATIONS.map((e, i) => ({
  n: String(i + 1),
  label: e.label,
  html: tex(e.src),
}));

const CLOSENESS = tex(String.raw`C_i = \frac{D_i^{-}}{D_i^{+} + D_i^{-}}`);

export default function MethodologyPage() {
  return <MethodologyView math={MATH} closeness={CLOSENESS} />;
}
