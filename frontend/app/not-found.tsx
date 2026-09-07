"use client";

import Link from "next/link";
import { Button, Navbar, Footer } from "@/components/ui";
import { useT } from "@/lib/i18n";

/* A 404 that stays inside the product rather than dropping the visitor onto a
   framework default. It keeps the nav and footer so every route out of here is
   one click away, and it is bilingual like the rest of the site — a Malay
   visitor hitting a dead link should not suddenly be read English. */

export default function NotFound() {
  const t = useT();

  return (
    <main className="min-h-[100svh] bg-background">
      <Navbar />

      <section className="mx-auto flex max-w-3xl flex-col items-start px-4 py-24 sm:px-6 sm:py-32">
        <p className="mono-label text-fog">{t("nf.eyebrow")}</p>

        <h1 className="apple-display mt-3 text-[38px] text-ink sm:text-[56px]">
          {t("nf.title")}
        </h1>

        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-fog sm:text-[18px]">
          {t("nf.body")}
        </p>

        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/interview/form" className="w-full sm:w-auto">
            <Button variant="primary" size="lg" className="w-full sm:w-auto">
              {t("nf.start")}
            </Button>
          </Link>
          <Link href="/" className="w-full sm:w-auto">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto">
              {t("nf.home")}
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
