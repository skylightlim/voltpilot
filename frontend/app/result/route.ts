import { NextResponse, type NextRequest } from "next/server";

/* Development shortcut: localhost:3000/result scores a sample buyer against the
   local backend and opens their results page, skipping the interview. Each
   visit scores afresh, so a change to the engine or the catalog shows up on the
   next reload. `?lang=bm` has the AI write its recommendation in Malay; the
   page's own language follows the EN/BM switch as usual.

   The sample buyer is chosen so every panel appears: home charging and
   "considering solar" (solar banner), monthly long trips (fuel panel and
   break-even), a mid budget (EVs and hybrids both on the shortlist).

   Production answers 404: a public URL must not mint results. */

const SAMPLE = {
  daily_km: 60,
  trips_per_week: 5,
  long_trip_frequency: "monthly",
  destination_region: "north",
  can_charge_home: true,
  can_charge_work: false,
  home_postcode: "47400",
  consider_solar: true,
  budget_max_rm: 150000,
  monthly_electricity_bill_rm: 180,
};

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const backend = process.env.BACKEND_URL || "http://localhost:8000";
  const language = req.nextUrl.searchParams.get("lang") === "bm" ? "bm" : "en";
  const profile = { ...SAMPLE, language };

  try {
    const made = await fetch(`${backend}/profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (!made.ok) throw new Error(`/profile ${made.status}`);
    const { token } = (await made.json()) as { token: string };

    const scored = await fetch(`${backend}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, profile, weights: {} }),
    });
    if (!scored.ok) throw new Error(`/score ${scored.status}`);

    return NextResponse.redirect(new URL(`/results/${token}`, req.url));
  } catch (e) {
    return new NextResponse(
      `Could not score the sample buyer against ${backend}: ${(e as Error).message}.\n` +
        "Is the backend running? See CLAUDE.md, Run locally.",
      { status: 502, headers: { "content-type": "text/plain" } },
    );
  }
}
