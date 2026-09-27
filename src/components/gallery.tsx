"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Clock, Heart, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageCard } from "@/components/image-card";
import { ImageLightbox } from "@/components/image-lightbox";
import { ALL_TAGS_FILTER, TAG_FILTER_OPTIONS } from "@/lib/tags";
import type { GalleryViewMode } from "@/lib/use-gallery-view";
import { distributeIntoColumns, estimateAspectRatio } from "@/lib/masonry";
import type { BatchJobRecord, ImageRecord } from "@/lib/types";

type RenderItem =
  | { kind: "pending"; index: number }
  | { kind: "batchPending"; index: number }
  | { kind: "image"; image: ImageRecord };

export function Gallery({
  images,
  onDelete,
  onImageUpdated,
  onUseAsReference,
  query,
  setQuery,
  favoritesOnly,
  setFavoritesOnly,
  tagFilter,
  setTagFilter,
  isGenerating,
  partialPreview,
  pendingCount = 0,
  pendingBatchJobs = [],
  view,
  columns,
}: {
  images: ImageRecord[];
  onDelete: (image: ImageRecord) => void;
  onImageUpdated: (image: ImageRecord) => void;
  onUseAsReference: (image: ImageRecord) => void;
  query: string;
  setQuery: (q: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: boolean) => void;
  tagFilter: string;
  setTagFilter: (t: string) => void;
  isGenerating: boolean;
  partialPreview: string | null;
  pendingCount?: number;
  pendingBatchJobs?: BatchJobRecord[];
  view: GalleryViewMode;
  columns: number;
}) {
  // Economy-mode batch jobs haven't produced any `images` rows yet (ingestion is what
  // creates them, all at once, when the batch finishes) — so every requested image in a
  // still-pending job is "still expected," unlike the live-stream placeholders above.
  const batchPendingCount = pendingBatchJobs.reduce((sum, job) => sum + job.requestCount, 0);
  const [searchOpen, setSearchOpen] = useState(false);
  const showSearchInput = searchOpen || query.length > 0;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return images.filter((img) => {
      if (favoritesOnly && !img.favorite) return false;
      if (tagFilter !== ALL_TAGS_FILTER && img.tag !== tagFilter) return false;
      if (query && !img.prompt.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [images, query, favoritesOnly, tagFilter]);

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    if (isGenerating) {
      for (let i = 0; i < Math.max(pendingCount, 1); i++) items.push({ kind: "pending", index: i });
    }
    for (let i = 0; i < batchPendingCount; i++) items.push({ kind: "batchPending", index: i });
    for (const image of filtered) items.push({ kind: "image", image });
    return items;
  }, [isGenerating, pendingCount, batchPendingCount, filtered]);

  // Placeholders render as squares (their real size isn't known yet), so they get a
  // neutral 1:1 weight; real images use their stored size to estimate how tall they'll
  // render, so the shortest-column heuristic below reflects actual layout.
  const masonryColumns = useMemo(() => {
    if (view !== "masonry") return null;
    return distributeIntoColumns(renderItems, columns, (item) =>
      item.kind === "image" ? estimateAspectRatio(item.image.size) : 1
    );
  }, [view, renderItems, columns]);

  function renderCard(item: RenderItem) {
    if (item.kind === "pending") {
      return (
        <div
          key={`pending-${item.index}`}
          className="relative aspect-square rounded-lg overflow-hidden border bg-card"
        >
          {item.index === 0 && partialPreview ? (
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
      );
    }
    if (item.kind === "batchPending") {
      return (
        <div
          key={`batch-pending-${item.index}`}
          className="relative aspect-square rounded-lg overflow-hidden border border-dashed bg-card"
        >
          <div className="absolute inset-0 animate-pulse bg-muted/60" />
          <div className="absolute inset-0 bg-background/10 flex items-end p-2">
            <Badge variant="secondary" className="gap-1">
              <Clock className="size-3" /> Pending — up to 24h
            </Badge>
          </div>
        </div>
      );
    }
    return (
      <ImageCard
        key={item.image.id}
        image={item.image}
        onDelete={onDelete}
        onImageUpdated={onImageUpdated}
        onUseAsReference={onUseAsReference}
        onOpen={() => setLightboxIndex(filtered.findIndex((img) => img.id === item.image.id))}
        masonry={view === "masonry"}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 flex-1 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {TAG_FILTER_OPTIONS.map((t) => (
            <Button
              key={t}
              variant={tagFilter === t ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTagFilter(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {showSearchInput ? (
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search by prompt..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => {
                  if (!query) setSearchOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    setSearchOpen(false);
                  }
                }}
                className="pl-8 h-7"
              />
            </div>
          ) : (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Search by prompt"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="size-3.5" />
            </Button>
          )}
          <Button
            variant={favoritesOnly ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
          >
            <Heart className="size-3.5" /> Favorites
          </Button>
        </div>
      </div>

      {filtered.length === 0 && !isGenerating && batchPendingCount === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No images yet. Generate your first one on the right.
        </div>
      ) : view === "masonry" && masonryColumns ? (
        <div className="overflow-y-auto pb-4">
          <div className="flex gap-3 items-start">
            {masonryColumns.map((column, i) => (
              <div key={i} className="flex flex-1 min-w-0 flex-col gap-3">
                {column.map(renderCard)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-y-auto pb-4">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {renderItems.map(renderCard)}
          </div>
        </div>
      )}

      {lightboxIndex !== null && filtered[lightboxIndex] && (
        <ImageLightbox
          images={filtered}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={onDelete}
          onImageUpdated={onImageUpdated}
          onUseAsReference={onUseAsReference}
        />
      )}
    </div>
  );
}
