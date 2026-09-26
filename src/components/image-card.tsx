"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, Heart, Layers, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImageRecord } from "@/lib/types";

export function ImageCard({
  image,
  onToggleFavorite,
  onDelete,
  onUseAsReference,
}: {
  image: ImageRecord;
  onToggleFavorite: (image: ImageRecord) => void;
  onDelete: (image: ImageRecord) => void;
  onUseAsReference: (image: ImageRecord) => void;
}) {
  const [deleting, setDeleting] = useState(false);

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
      onToggleFavorite(data.image);
    }
  }

  return (
    <div className="group relative rounded-lg overflow-hidden border bg-card">
      <div className="relative aspect-square w-full">
        <Image
          src={image.blobUrl}
          alt={image.prompt}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover"
          unoptimized
        />
      </div>

      <div className="absolute inset-x-0 top-0 p-1.5 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <Badge variant="secondary" className="text-[10px] font-mono">
          {image.sourceType}
        </Badge>
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
      </div>

      <div className="absolute inset-x-0 bottom-0 p-2 flex flex-col gap-1.5 bg-gradient-to-t from-background/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[11px] line-clamp-2 text-foreground/90">{image.prompt}</p>
        <div className="flex gap-1">
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
                <a href={image.blobUrl} download target="_blank" rel="noreferrer">
                  <Button size="icon" variant="secondary" className="size-7">
                    <Download className="size-3.5" />
                  </Button>
                </a>
              }
            />
            <TooltipContent>Download</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="secondary"
                  className="size-7 ml-auto"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </Button>
              }
            />
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
