"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, Heart, Layers, Loader2, Tag as TagIcon, Trash2, Type, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ASSIGNABLE_TAGS } from "@/lib/tags";
import type { ImageRecord } from "@/lib/types";

const NO_TAG = "No tag";

export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  onDelete,
  onImageUpdated,
  onUseAsReference,
  onUseAsPrompt,
}: {
  images: ImageRecord[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete: (image: ImageRecord) => void;
  onImageUpdated: (image: ImageRecord) => void;
  onUseAsReference: (image: ImageRecord) => void;
  onUseAsPrompt: (image: ImageRecord) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const image = images[index];
  const activeThumbRef = useRef<HTMLButtonElement>(null);
  const lastWheelRef = useRef(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndexChange(Math.max(0, index - 1));
      else if (e.key === "ArrowRight") onIndexChange(Math.min(images.length - 1, index + 1));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, images.length, onClose, onIndexChange]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ block: "nearest" });
  }, [index]);

  // Wraps around at both ends so scrolling feels continuous, like the reference site's
  // rail. Throttled because trackpads fire many small wheel events per physical scroll.
  function handleWheel(e: React.WheelEvent) {
    const now = Date.now();
    if (now - lastWheelRef.current < 350) return;
    if (Math.abs(e.deltaY) < 10) return;
    lastWheelRef.current = now;
    const next = e.deltaY > 0 ? (index + 1) % images.length : (index - 1 + images.length) % images.length;
    onIndexChange(next);
  }

  if (!image) return null;

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/images/${image.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDelete(image);
      if (images.length <= 1) onClose();
      else onIndexChange(Math.min(index, images.length - 2));
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

  function handleUseAsPromptClick() {
    onUseAsPrompt(image);
    onClose();
  }

  function handleUseAsReferenceClick() {
    onUseAsReference(image);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-background/95 backdrop-blur-sm" onWheel={handleWheel}>
      <div className="relative flex flex-1 items-center justify-center p-4 lg:p-8">
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <Select value={image.tag ?? NO_TAG} onValueChange={(v) => v && handleTagChange(v)}>
            <SelectTrigger
              size="sm"
              className="h-8 w-8 justify-center rounded-full border-none bg-secondary/80 p-0 hover:bg-secondary [&>svg]:hidden hover:cursor-pointer"
              title="Set tag"
            >
              <span className="flex items-center justify-center">
                <TagIcon className="size-4" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TAG}>No tag</SelectItem>
              {ASSIGNABLE_TAGS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="secondary"
            onClick={handleFavorite}
            aria-label="Favorite"
            className="rounded-full bg-secondary/80 hover:bg-secondary"
          >
            <Heart className={image.favorite ? "size-4 fill-red-500 text-red-500" : "size-4"} />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Download"
            className="rounded-full bg-secondary/80 hover:bg-secondary"
            nativeButton={false}
            render={<a href={image.blobUrl} download target="_blank" rel="noreferrer" />}
          >
            <Download className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-secondary/80 hover:bg-secondary"
          >
            <X className="size-4" />
          </Button>
        </div>
        {index > 0 && (
          <Button
            size="icon"
            variant="secondary"
            onClick={() => onIndexChange(index - 1)}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-secondary/80 hover:bg-secondary"
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}
        <Image
          src={image.blobUrl}
          alt={image.prompt}
          width={1000}
          height={1000}
          sizes="80vw"
          className="h-auto max-h-full w-auto max-w-full rounded-2xl object-contain"
          unoptimized
        />
        {index < images.length - 1 && (
          <Button
            size="icon"
            variant="secondary"
            onClick={() => onIndexChange(index + 1)}
            aria-label="Next image"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-secondary/80 hover:bg-secondary"
          >
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>

      <div className="flex w-[280px] shrink-0 flex-col border-l bg-background">
      <ScrollArea className="flex-1 min-h-0">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {image.sourceType}
          </Badge>
          {image.tag && (
            <Badge variant="outline" className="text-[10px] max-w-32 truncate">
              {image.tag}
            </Badge>
          )}
        </div>

        <p className="text-sm text-foreground/90">{image.prompt}</p>

        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">{image.size}</Badge>
          <Badge variant="outline" className="text-[10px]">{image.quality}</Badge>
          <Badge variant="outline" className="text-[10px]">{image.model}</Badge>
        </div>
      </div>
      </ScrollArea>
      <div className="flex shrink-0 gap-1.5 border-t p-4">
        <Button size="icon" variant="secondary" className="size-8" onClick={handleUseAsPromptClick} aria-label="Use as prompt">
          <Type className="size-4" />
        </Button>
        <Button size="icon" variant="secondary" className="size-8" onClick={handleUseAsReferenceClick} aria-label="Use as reference">
          <Layers className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="size-8 ml-auto"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </Button>
      </div>
      </div>

      <div className="flex w-20 shrink-0 flex-col border-l bg-background">
      <ScrollArea className="flex-1 min-h-0">
      <div className="flex flex-col gap-1.5 p-2">
        {images.map((img, i) => (
          <button
            key={img.id}
            ref={i === index ? activeThumbRef : undefined}
            onClick={() => onIndexChange(i)}
            className={`relative aspect-square shrink-0 overflow-hidden rounded-md border ${
              i === index ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
            }`}
          >
            <Image src={img.blobUrl} alt={img.prompt} fill className="object-cover" unoptimized />
          </button>
        ))}
      </div>
      </ScrollArea>
      </div>
    </div>
  );
}
