"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n";

/* Route-level error boundary. Without this file a render crash shows Next's own
   error screen in production — an unbranded page with no way back and no Malay.

   Nav and Footer are deliberately NOT used here: if the crash came from inside
   one of them, rendering them again would loop the boundary. Plain links only. */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // Surfaces in the browser console and in whatever collects it server-side;
    // the digest is the only handle on the stack once the build is minified.
    console.error("[voltpilot] route error", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="flex min-h-[100svh] flex-col items-start justify-center bg-background px-4 py-20 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <p className="mono-label text-fog">{t("eb.eyebrow")}</p>

        <h1 className="apple-display mt-3 text-[32px] text-ink sm:text-[44px]">
          {t("eb.title")}
        </h1>

        <p className="mt-5 text-[17px] leading-relaxed text-fog sm:text-[18px]">
          {t("eb.body")}
        </p>

        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button variant="primary" size="lg" onClick={reset} className="w-full sm:w-auto">
            {t("eb.retry")}
          </Button>
          <Link href="/" className="w-full sm:w-auto">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto">
              {t("nf.home")}
            </Button>
          </Link>
        </div>

        {error.digest && (
          <p className="mt-8 font-mono text-[12px] text-muted">
            {t("eb.ref")} {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
