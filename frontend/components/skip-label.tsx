"use client";

import { useT } from "@/lib/i18n";

/** The skip link's text, split out so the root layout stays a server component. */
export function SkipLabel() {
  const t = useT();
  return <>{t("a11y.skip")}</>;
}
