"use client";

import { ChevronsUpDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BrandRecord } from "@/lib/brands";
import { brandDotColor, type ActiveBrand } from "@/lib/use-brands";
import { cn } from "cn";

export function BrandDot({ brand, className }: { brand: BrandRecord | null; className?: string }) {
  const color = brand ? brandDotColor(brand) : null;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        color ? "ring-1 ring-foreground/15" : "border border-dashed border-muted-foreground/60",
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

// Owner-only (BRANDS.md decision 7): rendered only when not read-only, and the brand list
// itself is only fetchable by the owner.
export function BrandSwitcher({
  brands,
  active,
  activeBrand,
  setActive,
  onManage,
}: {
  brands: BrandRecord[];
  active: ActiveBrand;
  activeBrand: BrandRecord | null;
  setActive: (value: ActiveBrand) => void;
  onManage: () => void;
}) {
  const visible = brands.filter((b) => !b.archivedAt);
  const label = activeBrand?.name ?? (active === "none" ? "No brand" : "All brands");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="h-7 max-w-full justify-start gap-2 px-2" />}
      >
        {activeBrand ? <BrandDot brand={activeBrand} /> : null}
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuRadioGroup value={active} onValueChange={(v) => setActive(v as ActiveBrand)}>
          <DropdownMenuRadioItem value="all">All brands</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="none">No brand</DropdownMenuRadioItem>
          {visible.length > 0 && <DropdownMenuSeparator />}
          {visible.map((brand) => (
            <DropdownMenuRadioItem key={brand.id} value={brand.id}>
              <BrandDot brand={brand} />
              <span className="truncate">{brand.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onManage}>
          <Settings2 />
          Manage brands…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
