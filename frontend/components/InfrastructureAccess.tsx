"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { apiService, type InfraStatus } from "@/lib/api";
import { useT, type StrKey } from "@/lib/i18n";

type Infra = Awaited<ReturnType<typeof apiService.getInfrastructure>>;

/** Badge tint per access class — green through red, on the dark panel. */
const BADGE: Record<InfraStatus, string> = {
  good: "border-emerald-400/60 bg-emerald-400/20 text-emerald-200",
  moderate: "border-amber-400/60 bg-amber-400/20 text-amber-200",
  limited: "border-orange-400/60 bg-orange-400/20 text-orange-200",
  poor: "border-red-400/60 bg-red-400/20 text-red-200",
  very_poor: "border-red-400/60 bg-red-400/20 text-red-200",
};

/** Counts roll up on arrival rather than snapping — the look-up feels live. */
function useCountUp(target: number | null, decimals = 0) {
  const [v, setV] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target]);
  return decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-MY");
}

function Stat({
  label,
  value,
  badgeLabel,
  status,
  loading,
}: {
  label: string;
  value: string;
  badgeLabel: string;
  status?: InfraStatus;
  loading: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-[16px] border border-white/15 bg-white/[0.07] px-5 py-4">
      <span className="text-[11.5px] font-bold tracking-wide text-white/70">{label}</span>
      <strong className="count-pop text-[30px] font-extrabold leading-none text-white tabular-nums">
        {loading ? "…" : value}
      </strong>
      {loading ? (
        <span className="h-[26px] w-28 animate-pulse rounded-full bg-white/10" />
      ) : (
        status && (
          <span
            className={`inline-flex items-center rounded-full border px-3.5 py-1 text-[12px] font-bold ${BADGE[status]}`}
          >
            {badgeLabel}: {t(`ia.st.${status}` as StrKey).toLowerCase()}
          </span>
        )
      )}
    </div>
  );
}

export function InfrastructureAccess({ token }: { token: string }) {
  const t = useT();
  const [data, setData] = useState<Infra | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    apiService
      .getInfrastructure(token)
      .then((r) => alive && setData(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [token]);

  const loading = !data && !failed;
  const area = data?.area;
  const route = data?.route;
  const localRoute = !!route?.local;

  const areaCount = useCountUp(area ? area.count : null);
  const density = useCountUp(
    route && !localRoute ? (route.density_per_100km ?? 0) : null,
    1,
  );

  return (
    <section className="mt-8">
      <div className="relative overflow-hidden rounded-[26px] border border-emerald-400/25 bg-[linear-gradient(135deg,#10201a_0%,#12303f_55%,#0e2a1f_100%)] p-7 shadow-[0_24px_70px_-30px_rgba(16,185,129,0.5)] sm:p-9">
        {/* corner glows, purely decorative */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_240px_at_12%_0%,rgba(52,211,153,0.18),transparent_60%),radial-gradient(500px_260px_at_95%_100%,rgba(56,189,248,0.18),transparent_60%)]"
        />

        <div className="relative z-10 flex flex-col items-center gap-8 sm:flex-row sm:gap-11">
          {/* radar sweep */}
          <div aria-hidden className="grid shrink-0 place-items-center">
            <div className="relative h-[150px] w-[150px]">
              <span className="radar-ring" />
              <span className="radar-ring r2" />
              <span className="radar-ring r3" />
              <span className="radar-pin absolute left-1/2 top-1/2 grid h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500">
                <Zap className="h-7 w-7 text-white drop-shadow" />
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 text-white">
            <p className="mono-label text-[11px] tracking-widest text-emerald-300">
              {t("ia.label")}
            </p>
            <h2 className="apple-display-2 mt-2 text-[26px] font-bold text-white sm:text-[30px]">
              {t("ia.title")}
            </h2>

            {failed ? (
              <p className="mt-4 text-[15px] leading-relaxed text-white/80">{t("ia.err")}</p>
            ) : (
              <>
                <p className="mt-4 text-[16px] font-semibold leading-relaxed text-white/95">
                  {loading || !area ? (
                    t("ia.loadingArea")
                  ) : (
                    <>
                      There {area.count === 1 ? "is" : "are"}{" "}
                      <b className="text-emerald-300">{area.count}</b> station
                      {area.count === 1 ? "" : "s"} within {Math.round(area.radius_km)} km of your
                      postcode — public access here is{" "}
                      <b className="text-emerald-300">{t(`ia.st.${area.status}` as StrKey)}</b>.
                    </>
                  )}
                </p>

                <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/75">
                  {loading || !route ? (
                    t("ia.loadingRoute")
                  ) : localRoute ? (
                    t("ia.localRoute")
                  ) : (
                    <>
                      Along your usual {Math.round(route.route_km ?? 0)} km route, charging density
                      is{" "}
                      <b className="text-sky-300">{t(`ia.st.${route.status}` as StrKey)}</b> at{" "}
                      <b className="text-sky-300">
                        {(route.density_per_100km ?? 0).toFixed(1)}
                      </b>{" "}
                      stations per 100 km — the longest stretch without a charger is about{" "}
                      {Math.round(route.max_gap_km ?? 0)} km.
                    </>
                  )}
                </p>

                <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
                  <Stat
                    label={t("ia.statArea")}
                    value={areaCount}
                    badgeLabel={t("ia.badgeArea")}
                    status={area?.status}
                    loading={loading}
                  />
                  <Stat
                    label={t("ia.statRoute")}
                    value={localRoute ? "—" : density}
                    badgeLabel={t("ia.badgeRoute")}
                    status={route?.status}
                    loading={loading}
                  />
                </div>

                {data && (
                  <p className="mt-4 text-[11.5px] text-white/45">{data.source}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
