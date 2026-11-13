"use client";

import { useEffect, useState } from "react";

/**
 * Loading-page stage: the Proton e.MAS 5 anatomy figure (a self-contained 2 MB
 * page, built in ~/Projects/emas5-anatomy) plays its take-apart animation while
 * the AI analyst works. It replaces the 9 MB Kia EV9 three.js scene.
 *
 * The page is static and framed, so there is no WebGL, no Draco decoder and no
 * camera fitting here. `still` (reduced motion) fades it in without the rise.
 */
// #showcase: no controls; it puts itself together, then names each assembly in turn.
const FIGURE_URL = "/anatomy/emas5.html#showcase";

export default function LieRoom({ still = false }: { still?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <iframe
        src={FIGURE_URL}
        title="Proton e.MAS 5 anatomy"
        loading="eager"
        tabIndex={-1}
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full border-0 transition-all ${
          still ? "duration-500" : "duration-[1400ms]"
        } ${shown ? "translate-y-0 opacity-100" : `${still ? "" : "translate-y-10"} opacity-0`}`}
      />
    </div>
  );
}
