"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { HardDrive, Heart, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageCard } from "@/components/image-card";
import type { ImageRecord } from "@/lib/types";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function Gallery({
  images,
  onDelete,
  onToggleFavorite,
  onUseAsReference,
  query,
  setQuery,
  favoritesOnly,
  setFavoritesOnly,
  isGenerating,
  partialPreview,
}: {
  images: ImageRecord[];
  onDelete: (image: ImageRecord) => void;
  onToggleFavorite: (image: ImageRecord) => void;
  onUseAsReference: (image: ImageRecord) => void;
  query: string;
  setQuery: (q: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: boolean) => void;
  isGenerating: boolean;
  partialPreview: string | null;
}) {
  const [usage, setUsage] = useState<{ totalBytes: number; count: number } | null>(null);

  useEffect(() => {
    fetch("/api/storage-usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, [images.length]);

  const filtered = useMemo(() => {
    return images.filter((img) => {
      if (favoritesOnly && !img.favorite) return false;
      if (query && !img.prompt.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [images, query, favoritesOnly]);

  return (
    <div className="flex flex-col gap-4 p-4 flex-1 min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by prompt..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button
          variant={favoritesOnly ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Heart className="size-3.5" /> Favorites
        </Button>
        {usage && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
            <HardDrive className="size-3.5" />
            {formatBytes(usage.totalBytes)} · {usage.count} images
          </div>
        )}
      </div>

      {filtered.length === 0 && !isGenerating ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No images yet. Generate your first one on the right.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pb-4">
          {isGenerating && (
            <div className="relative aspect-square rounded-lg overflow-hidden border bg-card">
              {partialPreview ? (
                <Image
                  src={`data:image/png;base64,${partialPreview}`}
                  alt="Generating preview"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 animate-pulse bg-muted" />
              )}
              <div className="absolute inset-0 bg-background/10 flex items-end p-2">
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="size-3 animate-spin" /> Rendering...
                </Badge>
              </div>
            </div>
          )}
          {filtered.map((image) => (
            <ImageCard
              key={image.id}
              image={image}
              onDelete={onDelete}
              onToggleFavorite={onToggleFavorite}
              onUseAsReference={onUseAsReference}
            />
          ))}
        </div>
      )}
    </div>
  );
}
