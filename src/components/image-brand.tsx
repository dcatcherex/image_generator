"use client";

import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger } from "@/components/ui/select";
import { BrandDot } from "@/components/brand-switcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBrandList } from "@/lib/brands-context";
import type { ImageRecord } from "@/lib/types";
import { cn } from "cn";

const NO_BRAND = "none";

/** The image's brand as a small badge, or nothing (always nothing for public viewers). */
export function ImageBrandBadge({ image, className }: { image: ImageRecord; className?: string }) {
  const brand = useBrandList().find((b) => b.id === image.brandId);
  if (!brand) return null;
  return (
    <Badge variant="outline" className={cn("gap-1 bg-background/80 text-[10px] max-w-32", className)}>
      <BrandDot brand={brand} className="size-2" />
      <span className="truncate">{brand.name}</span>
    </Badge>
  );
}

// Reassigns an image's brand (BRANDS.md decision 13), like the tag select next to it. Only
// the brand_id changes: the prompt snapshot keeps recording what the image was made with.
export function SetBrandSelect({
  image,
  onImageUpdated,
  triggerClassName,
  iconClassName = "size-3.5",
}: {
  image: ImageRecord;
  onImageUpdated: (image: ImageRecord) => void;
  triggerClassName: string;
  iconClassName?: string;
}) {
  const brands = useBrandList();
  // Archived brands stay listed only for the image that already has one, so it can't vanish.
  const options = brands.filter((b) => !b.archivedAt || b.id === image.brandId);
  if (options.length === 0) return null;

  async function handleChange(next: string) {
    const brandId = next === NO_BRAND ? null : next;
    if (brandId === image.brandId) return;
    const res = await fetch(`/api/images/${image.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId }),
    });
    if (res.ok) {
      onImageUpdated((await res.json()).image);
    } else {
      toast.error("Failed to update brand");
    }
  }

  return (
    <Select value={image.brandId ?? NO_BRAND} onValueChange={(v) => v && handleChange(v)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <SelectTrigger size="sm" className={triggerClassName}>
              <span className="flex items-center justify-center">
                <Bookmark className={iconClassName} />
              </span>
            </SelectTrigger>
          }
        />
        <TooltipContent>Set brand</TooltipContent>
      </Tooltip>
      {/* The trigger is a small icon button; brand names need more room than its width. */}
      <SelectContent className="min-w-52">
        <SelectItem value={NO_BRAND}>No brand</SelectItem>
        <SelectSeparator />
        {options.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            <BrandDot brand={b} />
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
