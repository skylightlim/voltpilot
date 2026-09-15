"use client";

/* Where to actually go and buy the recommended car.
 *
 * The site ranks 184 cars and then leaves the reader holding a name. This is
 * the step after the decision: the official Malaysian distributor for the
 * brand that won, with a route to its nearest showroom.
 *
 * Contacts come from data/brand_contacts.json via the results payload. Only 35
 * of 46 catalogue brands resolved to a verified official site, so a missing
 * brand is the normal case, not an error — this renders nothing at all rather
 * than an empty card, because a contact panel with no contact in it reads as a
 * broken page.
 */

import { Building2, ExternalLink, Phone } from "lucide-react";
import { useT } from "@/lib/i18n";

export type BrandContact = {
  brand: string;
  distributor: string | null;
  website: string | null;
  phone: string | null;
  as_of?: string;
};

/** Strips the scheme and any trailing slash for display, so a long URL reads as
 *  a destination rather than a string to parse. The href keeps the full URL. */
function hostLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** `tel:` cannot carry spaces or dashes, but the printed form is what people
 *  recognise — so display and dial diverge deliberately. */
const dialable = (phone: string) => phone.replace(/[^\d+]/g, "");

export function DealerContact({
  contact,
  model,
}: {
  contact: BrandContact | null | undefined;
  model?: string;
}) {
  const t = useT();
  if (!contact || (!contact.website && !contact.phone)) return null;

  return (
    <div className="rounded-lg border border-line bg-paper-2 p-5 sm:p-6">
      <p className="mono-label flex items-center gap-2 text-fog">
        <Building2 className="h-4 w-4" />
        {t("dc.title")}
      </p>
      <h3 className="mt-2 font-display text-[19px] font-bold text-ink">
        {model ? t("dc.headingModel", { model }) : t("dc.heading", { brand: contact.brand })}
      </h3>

      {contact.distributor && (
        <p className="mt-1 text-[15px] text-muted">
          {t("dc.distributor")}: <span className="text-ink">{contact.distributor}</span>
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {contact.phone && (
          <a
            href={`tel:${dialable(contact.phone)}`}
            className="pressable tap-target inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary-hover"
          >
            <Phone className="h-4 w-4" />
            {contact.phone}
          </a>
        )}
        {contact.website && (
          <a
            href={contact.website}
            target="_blank"
            rel="noopener noreferrer"
            className="pressable tap-target inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-white px-5 text-[15px] font-semibold text-ink hover:bg-parchment"
          >
            {t("dc.findShowroom")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{hostLabel(contact.website)}</span>
          </a>
        )}
      </div>

      {/* The ranking is impartial and sells nothing; saying so next to an
          outbound link to a manufacturer is the point at which a reader would
          otherwise start wondering. DESIGN.md §2. */}
      <p className="mt-3.5 text-[13px] leading-relaxed text-muted">{t("dc.note")}</p>
    </div>
  );
}
