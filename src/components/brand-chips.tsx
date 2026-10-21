"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrandDot } from "@/components/brand-switcher";
import { LOGO_LABELS, type BrandRecord, type LogoVariant } from "@/lib/brands";
import type { BrandInclude } from "@/lib/prompt-builder";

type ChipId = keyof BrandInclude;

const CHIPS: Array<{ id: ChipId; label: string }> = [
  { id: "palette", label: "Palette" },
  { id: "style", label: "Style" },
  { id: "logo", label: "Logo" },
  { id: "standingText", label: "Standing text" },
];

/** Why a chip can't be used with this brand (shown as its tooltip), or null if it can. */
function unavailableReason(brand: BrandRecord, id: ChipId, logoBlocked: string | null): string | null {
  const kit = brand.kit;
  switch (id) {
    case "palette":
      return kit.colors.length ? null : `${brand.name} has no colours`;
    case "style":
      return kit.style || kit.typeFeel || kit.dos.length || kit.donts.length ? null : `${brand.name} has no style set`;
    case "logo":
      return brand.logos.length ? logoBlocked : `${brand.name} has no logo — upload one in Manage brands`;
    case "standingText":
      return kit.standingText ? null : `${brand.name} has no standing text`;
  }
}

// Which parts of the active brand the next generation uses (BRANDS.md decision 8). A chip
// that can't apply shows as off and disabled but keeps its setting, so it comes back on
// when, say, Economy mode is switched off again.
export function BrandChips({
  brand,
  include,
  setInclude,
  logoVariant,
  setLogoVariant,
  logoBlocked,
}: {
  brand: BrandRecord;
  include: BrandInclude;
  setInclude: (include: BrandInclude) => void;
  logoVariant: LogoVariant;
  setLogoVariant: (variant: LogoVariant) => void;
  logoBlocked: string | null;
}) {
  const logoOn = include.logo && !unavailableReason(brand, "logo", logoBlocked);
  const variants = brand.logos.map((l) => l.variant);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Use from ${brand.name}`}>
        <span className="mr-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <BrandDot brand={brand} />
          <span className="max-w-28 truncate">{brand.name}</span>
        </span>
        {CHIPS.map((chip) => {
          const reason = unavailableReason(brand, chip.id, logoBlocked);
          const on = include[chip.id] && !reason;
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={on}
              disabled={reason !== null}
              title={reason ?? `${on ? "Don't use" : "Use"} the brand's ${chip.label.toLowerCase()}`}
              onClick={() => setInclude({ ...include, [chip.id]: !include[chip.id] })}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      {logoOn && variants.length > 1 && (
        // SelectValue renders the raw value, so the label doubles as the value here.
        <Select
          value={LOGO_LABELS[variants.includes(logoVariant) ? logoVariant : variants[0]]}
          onValueChange={(v) => {
            const next = variants.find((x) => LOGO_LABELS[x] === v);
            if (next) setLogoVariant(next);
          }}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Logo variant">
            <span className="text-muted-foreground">Logo:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {variants.map((v) => (
              <SelectItem key={v} value={LOGO_LABELS[v]}>{LOGO_LABELS[v]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
