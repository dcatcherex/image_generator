"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RICH_MENU_SIZE,
  RICH_MENU_TEMPLATES,
  exportRichMenuJpeg,
  extractLabels,
  getRichMenuTemplate,
  guessRichMenuTemplate,
  richMenuBounds,
  richMenuJson,
} from "@/lib/line-rich-menu";
import type { ImageRecord } from "@/lib/types";

// "Export for LINE": shows the tap areas over the image exactly as LINE will crop it, so grid
// drift is visible before uploading, then downloads the exact-size JPEG (<= 1 MB) and copies
// the matching rich menu JSON.
export function LineRichMenuDialog({
  image,
  open,
  onOpenChange,
}: {
  image: ImageRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dims = /^(\d+)x(\d+)$/.exec(image.size);
  const [templateId, setTemplateId] = useState(
    () => guessRichMenuTemplate(image.prompt, Number(dims?.[1]), Number(dims?.[2])).id
  );
  const [exporting, setExporting] = useState(false);
  const template = getRichMenuTemplate(templateId)!;
  const target = RICH_MENU_SIZE[template.kind];
  const bounds = useMemo(() => richMenuBounds(template), [template]);
  const labels = useMemo(() => extractLabels(image.prompt), [image.prompt]);

  // Cover-fit crops whatever doesn't match the target ratio; warn when that's noticeable.
  const cropWarning =
    dims && Math.abs(Number(dims[1]) / Number(dims[2]) / (target.width / target.height) - 1) > 0.03;

  async function handleDownload() {
    setExporting(true);
    try {
      const blob = await exportRichMenuJpeg(image.blobUrl, template.kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rich-menu-${template.id}-${target.width}x${target.height}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Saved ${target.width}×${target.height} JPEG (${Math.round(blob.size / 1024)} KB)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyJson() {
    await navigator.clipboard.writeText(JSON.stringify(richMenuJson(template, labels), null, 2));
    toast.success("Rich menu JSON copied — set each area's action before creating the menu");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export for LINE rich menu</DialogTitle>
          <DialogDescription>
            Dashed boxes are the tap areas. If a button&apos;s artwork crosses a line, regenerate or pick another layout.
          </DialogDescription>
        </DialogHeader>
        <Select value={templateId} onValueChange={(v) => v && setTemplateId(v)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: string) => getRichMenuTemplate(v)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(["large", "compact"] as const).map((kind) => (
              <SelectGroup key={kind}>
                <SelectLabel>
                  {kind === "large" ? "Large" : "Compact"} · {RICH_MENU_SIZE[kind].width}×{RICH_MENU_SIZE[kind].height}
                </SelectLabel>
                {RICH_MENU_TEMPLATES.filter((t) => t.kind === kind).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <div
          className="relative w-full overflow-hidden rounded-md border"
          style={{ aspectRatio: `${target.width} / ${target.height}` }}
        >
          <Image src={image.blobUrl} alt={image.prompt} fill sizes="672px" className="object-cover" />
          {bounds.map((b, i) => (
            <div
              key={i}
              className="absolute border-2 border-dashed border-white/90 outline-1 outline-black/50 -outline-offset-3"
              style={{
                left: `${(b.x / target.width) * 100}%`,
                top: `${(b.y / target.height) * 100}%`,
                width: `${(b.width / target.width) * 100}%`,
                height: `${(b.height / target.height) * 100}%`,
              }}
            >
              <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 text-xs text-white">
                {i + 1}
                {labels[i] ? ` · ${labels[i]}` : ""}
              </span>
            </div>
          ))}
        </div>
        {cropWarning && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This image&apos;s shape doesn&apos;t match a {template.kind} menu, so the edges will be cropped as shown.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleCopyJson}>
            <Copy className="size-4" />
            Copy rich menu JSON
          </Button>
          <Button onClick={handleDownload} disabled={exporting}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download {target.width}×{target.height} JPEG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
