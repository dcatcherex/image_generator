"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, Heart, LayoutGrid, Layers, Loader2, Tag as TagIcon, Trash2, TriangleAlert, Type, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ASSIGNABLE_TAGS } from "@/lib/tags";
import { useReadOnly } from "@/lib/read-only";
import { downloadUrl } from "@/lib/download";
import type { ImageRecord } from "@/lib/types";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { LineRichMenuDialog } from "@/components/line-rich-menu-dialog";
import { looksLikeRichMenu } from "@/lib/line-rich-menu";
import { ImageBrandBadge, SetBrandSelect } from "@/components/image-brand";

const NO_TAG = "No tag";

// `size` is stored as "WIDTHxHEIGHT" (or "auto" when the model picked), which is enough
// for next/image to reserve the right aspect ratio in masonry without storing dimensions.
function parseSize(size: string): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(size);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

export function ImageCard({
  image,
  onImageUpdated,
  onDelete,
  onUseAsPrompt,
  onUseAsReference,
  onRefine,
  onOpen,
  masonry = false,
  eager = false,
}: {
  image: ImageRecord;
  onImageUpdated: (image: ImageRecord) => void;
  onDelete: (image: ImageRecord) => void;
  onUseAsPrompt: (image: ImageRecord) => void;
  onUseAsReference: (image: ImageRecord) => void;
  onRefine: (image: ImageRecord) => void;
  onOpen?: () => void;
  masonry?: boolean;
  // Above-the-fold cards load eagerly so the LCP image isn't lazy-loaded.
  eager?: boolean;
}) {
  const loading = eager ? "eager" : "lazy";
  const readOnly = useReadOnly();
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [exportingLine, setExportingLine] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/images/${image.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDelete(image);
    } catch {
      toast.error("Failed to delete image");
      setDeleting(false);
    }
  }

  async function handleFavorite() {
    const res = await fetch(`/api/images/${image.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !image.favorite }),
    });
    if (res.ok) {
      const data = await res.json();
      onImageUpdated(data.image);
    }
  }

  async function handleTagChange(next: string) {
    const nextTag = next === NO_TAG ? null : next;
    const res = await fetch(`/api/images/${image.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: nextTag }),
    });
    if (res.ok) {
      const data = await res.json();
      onImageUpdated(data.image);
    } else {
      toast.error("Failed to update tag");
    }
  }

  return (
    <div className="group relative rounded-lg overflow-hidden border bg-card">
      {masonry ? (
        // Masonry needs the image's natural aspect ratio, taken from the stored size. For
        // "auto" sizes the ratio is unknown, so fall back to 1:1 intrinsic dimensions —
        // `h-auto` still lets the browser correct the height once the image loads.
        <Image
          src={image.blobUrl}
          alt={image.prompt}
          width={parseSize(image.size)?.width ?? 1024}
          height={parseSize(image.size)?.height ?? 1024}
          sizes="(max-width: 768px) 50vw, 25vw"
          loading={loading}
          className="block w-full h-auto cursor-pointer"
          onClick={onOpen}
        />
      ) : (
        <div className="relative aspect-square w-full cursor-pointer" onClick={onOpen}>
          <Image
            src={image.blobUrl}
            alt={image.prompt}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            loading={loading}
            className="object-cover"
          />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 p-1.5 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-1">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {image.sourceType}
          </Badge>
          {image.tag && (
            <Badge variant="outline" className="text-[10px] bg-background/80 max-w-32 truncate">
              {image.tag}
            </Badge>
          )}
          <ImageBrandBadge image={image} />
          {image.background === "transparent" && image.transparencyOk === false && (
            <Badge variant="destructive" className="gap-1 text-[10px]" title="Transparent background requested but the image is fully opaque">
              <TriangleAlert className="size-3" /> Opaque
            </Badge>
          )}
        </div>
        {!readOnly && (
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon" variant="secondary" className="size-7" onClick={handleFavorite}>
                  <Heart className={image.favorite ? "size-3.5 fill-red-500 text-red-500" : "size-3.5"} />
                </Button>
              }
            />
            <TooltipContent>Favorite</TooltipContent>
          </Tooltip>
        </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-2 flex flex-col gap-1.5 bg-gradient-to-t from-background/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-1">
          {!readOnly && (
          <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon" variant="secondary" className="size-7" onClick={() => onUseAsPrompt(image)}>
                  <Type className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>Use as prompt</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon" variant="secondary" className="size-7" onClick={() => onUseAsReference(image)}>
                  <Layers className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>Use as reference</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon" variant="secondary" className="size-7" onClick={() => onRefine(image)}>
                  <Wand2 className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>Refine</TooltipContent>
          </Tooltip>
          <Select value={image.tag ?? NO_TAG} onValueChange={(v) => v && handleTagChange(v)}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-7 justify-center border-none bg-secondary p-0 hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] [&>svg]:hidden"
                  >
                    <span className="flex items-center justify-center">
                      <TagIcon className="size-3.5" />
                    </span>
                  </SelectTrigger>
                }
              />
              <TooltipContent>Set tag</TooltipContent>
            </Tooltip>
            <SelectContent>
              <SelectItem value={NO_TAG}>No tag</SelectItem>
              {ASSIGNABLE_TAGS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SetBrandSelect
            image={image}
            onImageUpdated={onImageUpdated}
            triggerClassName="h-7 w-7 justify-center border-none bg-secondary p-0 hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] [&>svg]:hidden"
          />
          </>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <a href={downloadUrl(image.blobUrl)} download>
                  <Button size="icon" variant="secondary" className="size-7">
                    <Download className="size-3.5" />
                  </Button>
                </a>
              }
            />
            <TooltipContent>Download</TooltipContent>
          </Tooltip>
          {looksLikeRichMenu(image.prompt, image.size) && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon" variant="secondary" className="size-7" onClick={() => setExportingLine(true)}>
                  <LayoutGrid className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>Export for LINE rich menu</TooltipContent>
          </Tooltip>
          )}
          {!readOnly && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="secondary"
                  className="size-7 ml-auto"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </Button>
              }
            />
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
          )}
        </div>
      </div>
      <ConfirmDeleteDialog
        image={image}
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        onConfirm={handleDelete}
      />
      {exportingLine && <LineRichMenuDialog image={image} open onOpenChange={setExportingLine} />}
    </div>
  );
}
