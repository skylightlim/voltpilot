"use client";

import * as React from "react";

type Summary = {
  n: number;
  median: number | null;
  mean: number | null;
  p90: number | null;
  fastest: number | null;
  slowest: number | null;
};

type Stats = {
  generated_at: string;
  results_total: number;
  timing: Summary & {
    by_via: Record<string, Summary>;
    histogram: { label: string; count: number }[];
  };
  daily: { day: string; results: number }[];
  mind: { answered: number; had_prior_view: number; changed: number; after: Record<string, number> };
  reports_sent: number;
  posthog_share_url: string | null;
};

const KEY = "vp-dashboard-key";

function fmt(seconds: number | null): string {
  if (seconds === null) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s.toString().padStart(2, "0")} s` : `${s} s`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-t border-line py-5 pr-6">
      <p className="mono-label text-fog">{label}</p>
      <p className="figure mt-2 text-[30px] leading-none text-primary">{value}</p>
      {note ? <p className="mt-2 text-[13px] text-fog">{note}</p> : null}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-[14px]">
          <span className="text-fog">{r.label}</span>
          <span className="h-3 rounded-full bg-line">
            <span
              className="block h-3 rounded-full bg-primary"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums text-ink">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const [key, setKey] = React.useState("");
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async (passphrase: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/dashboard/stats", {
        headers: { "X-Dashboard-Key": passphrase },
        cache: "no-store",
      });
      if (res.status === 401) throw new Error("Wrong passphrase.");
      if (res.status === 404) throw new Error("The dashboard is not switched on for this site yet.");
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      setStats((await res.json()) as Stats);
      sessionStorage.setItem(KEY, passphrase);
    } catch (e) {
      sessionStorage.removeItem(KEY);
      setStats(null);
      setError(e instanceof Error ? e.message : "Could not load the numbers.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const saved = sessionStorage.getItem(KEY);
    if (saved) {
      setKey(saved);
      void load(saved);
    }
  }, [load]);

  if (!stats) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <h1 className="font-display text-[24px] font-semibold text-ink">Dashboard</h1>
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void load(key.trim());
          }}
        >
          <label htmlFor="pp" className="text-[14px] text-fog">
            Passphrase
          </label>
          <input
            id="pp"
            type="password"
            autoComplete="current-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[16px] text-ink"
          />
          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full rounded-full bg-primary px-5 py-3 text-[15px] font-[480] text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Checking…" : "Open"}
          </button>
          {error ? (
            <p role="alert" className="text-[14px] text-red-700">
              {error}
            </p>
          ) : null}
        </form>
      </main>
    );
  }

  const t = stats.timing;
  const mindPct =
    stats.mind.had_prior_view > 0
      ? `${Math.round((stats.mind.changed / stats.mind.had_prior_view) * 100)}%`
      : "–";

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-[28px] font-semibold text-ink">Dashboard</h1>
        <div className="flex items-center gap-4 text-[13px] text-fog">
          <span>Updated {new Date(stats.generated_at).toLocaleTimeString()}</span>
          <button className="underline" onClick={() => void load(key)}>
            Refresh
          </button>
          <button
            className="underline"
            onClick={() => {
              sessionStorage.removeItem(KEY);
              setStats(null);
              setKey("");
            }}
          >
            Lock
          </button>
        </div>
      </div>

      <h2 className="mono-label mt-10 text-fog">Time from starting the interview to the result</h2>
      {t.n === 0 ? (
        <p className="mt-4 text-[15px] text-fog">No timed results yet.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4">
            <Stat label="Median" value={fmt(t.median)} note={`${t.n} timed results`} />
            <Stat label="Average" value={fmt(t.mean)} />
            <Stat label="Slowest 10%" value={fmt(t.p90)} note="took longer than this" />
            <Stat label="Fastest" value={fmt(t.fastest)} />
          </div>
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            <Bars rows={t.histogram} />
            <ul className="space-y-2 text-[14px]">
              {Object.entries(t.by_via).map(([via, s]) => (
                <li key={via} className="flex justify-between border-b border-line pb-2">
                  <span className="text-fog">{via === "voice" ? "Voice interview" : "Form interview"}</span>
                  <span className="text-ink">
                    median {fmt(s.median)} · {s.n} runs
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <h2 className="mono-label mt-12 text-fog">Results per day, last 14 days</h2>
      <div className="mt-4">
        <Bars rows={stats.daily.map((d) => ({ label: d.day.slice(5), count: d.results }))} />
      </div>

      <h2 className="mono-label mt-12 text-fog">Outcomes</h2>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4">
        <Stat label="Results made" value={String(stats.results_total)} />
        <Stat label="Reports emailed" value={String(stats.reports_sent)} />
        <Stat
          label="Changed their mind"
          value={mindPct}
          note={`${stats.mind.changed} of ${stats.mind.had_prior_view} who had a prior view`}
        />
        <Stat label="Answered the question" value={String(stats.mind.answered)} />
      </div>

      <h2 className="mono-label mt-12 text-fog">Visitors and clicks</h2>
      {stats.posthog_share_url ? (
        <iframe
          title="PostHog dashboard"
          src={stats.posthog_share_url}
          className="mt-4 h-[900px] w-full rounded-xl border border-line"
        />
      ) : (
        <p className="mt-4 text-[15px] text-fog">
          Not connected yet. Share a PostHog dashboard and set POSTHOG_SHARE_URL to show it here.
        </p>
      )}
    </main>
  );
}
