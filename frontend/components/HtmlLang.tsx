"use client";

/* Keeps <html lang> in step with the language the interface is actually in.
 *
 * `app/layout.tsx` is a server component and hard-codes lang="en", but the
 * language lives in sessionStorage and is switched client-side. So a page could
 * render entirely in Malay — "Berapa km anda memandu pada hari biasa?" — while
 * still declaring itself English. A screen reader then pronounces Malay with
 * English phonetics, and a crawler indexes the page under the wrong language.
 *
 * Renders nothing; it only sets the attribute.
 */

import { useEffect } from "react";
import { useLang } from "@/lib/i18n";

export function HtmlLang() {
  const lang = useLang();

  useEffect(() => {
    // "bm" is what this codebase calls it; the IETF subtag for Malay is "ms".
    document.documentElement.lang = lang === "bm" ? "ms" : "en";
  }, [lang]);

  return null;
}
