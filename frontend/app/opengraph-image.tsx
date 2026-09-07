import { ImageResponse } from "next/og";

/* The social card, drawn from the site's own tokens rather than exported from a
   design tool — so it can never drift out of sync with the palette the pages
   actually ship. Rendered once at build time.

   Why not a generated illustration: this card is read at thumbnail size in a
   chat window, where a photographic image turns to mush. Type and colour survive
   that scale; a picture does not. */

export const alt = "VoltPilot — Malaysia's AI car decision guide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BONE = "#f4f3ec";
const INK = "#15221c";
const PINE = "#1c4a3a";
const AMBER = "#c97f10";
const FOG = "#5c6b62";
const LINE = "#d9d5c5";

/** Figtree if the build host can reach Google Fonts; the system sans if not.
 *  A social card is never worth failing a deploy over. */
async function figtree(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Figtree:wght@${weight}&display=swap`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const [light, medium] = await Promise.all([figtree(300), figtree(500)]);
  const fonts = [
    light && { name: "Figtree", data: light, weight: 300 as const, style: "normal" as const },
    medium && { name: "Figtree", data: medium, weight: 500 as const, style: "normal" as const },
  ].filter(Boolean) as NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BONE,
          padding: "72px 80px",
          fontFamily: "Figtree, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: PINE,
              color: BONE,
              fontSize: 26,
              fontWeight: 500,
            }}
          >
            V
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: INK, letterSpacing: -0.6 }}>
            VoltPilot
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 300, color: INK, letterSpacing: -1.7 }}>
            EV or Hybrid?
          </div>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 300, color: PINE, letterSpacing: -1.7 }}>
            Make the decision with numbers.
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 27, fontWeight: 300, color: FOG }}>
            184 Malaysian models ranked on your budget, routes and electricity tariff.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 40, borderTop: `1px solid ${LINE}`, paddingTop: 26 }}>
          {[
            ["6", "decision criteria"],
            ["5", "scoring engines"],
            ["2 min", "to a ranking"],
          ].map(([n, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 500, color: PINE }}>{n}</div>
              <div style={{ display: "flex", fontSize: 21, fontWeight: 300, color: FOG }}>{label}</div>
            </div>
          ))}
          <div style={{ display: "flex", marginLeft: "auto", width: 76, height: 5, background: AMBER, borderRadius: 50 }} />
        </div>
      </div>
    ),
    { ...size, fonts: fonts?.length ? fonts : undefined },
  );
}
