"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Clock, Heart, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageCard } from "@/components/image-card";
import { ImageLightbox } from "@/components/image-lightbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ALL_TAGS_FILTER, TAG_FILTER_OPTIONS } from "@/lib/tags";
import type { GalleryViewMode } from "@/lib/use-gallery-view";
import { distributeIntoColumns, estimateAspectRatio } from "@/lib/masonry";
import type { BatchJobRecord, ImageRecord } from "@/lib/types";

type RenderItem =
  | { kind: "pending"; index: number }
  | { kind: "batchPending"; index: number }
  | { kind: "image"; image: ImageRecord };

// Narrowest a tile may get before the grid drops a column. The saved "Columns" setting is a
// preference for wide screens; on a phone or a narrow pane it would otherwise squeeze 5 tiles
// into ~60px each.
const MIN_TILE_PX = 140;
const GRID_GAP_PX = 12;

function useMaxColumns() {
  // A callback ref (kept in state): the measured element is swapped between the grid, the
  // masonry layout and the empty state, so an effect must re-run whenever it changes.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [maxColumns, setMaxColumns] = useState<number | null>(null);

  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setMaxColumns(Math.max(2, Math.floor((width + GRID_GAP_PX) / (MIN_TILE_PX + GRID_GAP_PX))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return { ref: setEl, maxColumns };
}

export function Gallery({
  images,
  onDelete,
  onImageUpdated,
  onUseAsReference,
  onUseAsPrompt,
  onRefine,
  query,
  setQuery,
  favoritesOnly,
  setFavoritesOnly,
  tagFilter,
  setTagFilter,
  pendingPreviews,
  pendingBatchJobs = [],
  view,
  columns: preferredColumns,
}: {
  images: ImageRecord[];
  onDelete: (image: ImageRecord) => void;
  onImageUpdated: (image: ImageRecord) => void;
  onUseAsReference: (image: ImageRecord) => void;
  onUseAsPrompt: (image: ImageRecord) => void;
  onRefine: (image: ImageRecord) => void;
  query: string;
  setQuery: (q: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: boolean) => void;
  tagFilter: string;
  setTagFilter: (t: string) => void;
  // One entry per in-flight placeholder tile; a string is that tile's latest partial preview frame.
  pendingPreviews: Array<string | null>;
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
  const { ref: scrollRef, maxColumns } = useMaxColumns();
  const columns = maxColumns ? Math.min(preferredColumns, maxColumns) : preferredColumns;

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
    for (let i = 0; i < pendingPreviews.length; i++) items.push({ kind: "pending", index: i });
    for (let i = 0; i < batchPendingCount; i++) items.push({ kind: "batchPending", index: i });
    for (const image of filtered) items.push({ kind: "image", image });
    return items;
  }, [pendingPreviews, batchPendingCount, filtered]);

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
          {pendingPreviews[item.index] ? (
            <Image
              src={`data:image/png;base64,${pendingPreviews[item.index]}`}
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
        onRefine={onRefine}
        onOpen={() => setLightboxIndex(filtered.findIndex((img) => img.id === item.image.id))}
        masonry={view === "masonry"}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 flex-1 min-h-0">
      <div className="flex items-center justify-between gap-2">
        {/* One scrollable row on narrow screens (wrapping into 3 rows of chips eats the
            gallery); the bleed + padding keeps the focus ring and edge chips un-clipped. */}
        <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TAG_FILTER_OPTIONS.map((t) => (
            <Button
              key={t}
              variant={tagFilter === t ? "default" : "outline"}
              size="sm"
              className="h-8 shrink-0 text-xs sm:h-7"
              onClick={() => setTagFilter(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {showSearchInput ? (
            <div className="relative w-36 sm:w-48">
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
                className="pl-8 h-8 sm:h-7"
              />
            </div>
          ) : (
            <Button
              variant="outline"
              size="icon-sm"
              className="size-8 sm:size-7"
              aria-label="Search by prompt"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="size-3.5" />
            </Button>
          )}
          <Button
            variant={favoritesOnly ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs sm:h-7"
            aria-label="Favorites"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly(!favoritesOnly)}
          >
            <Heart className="size-3.5" />
            <span className="hidden sm:inline">Favorites</span>
          </Button>
        </div>
      </div>

      {filtered.length === 0 && pendingPreviews.length === 0 && batchPendingCount === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No images yet. Generate your first one from the Create panel.
        </div>
      ) : view === "masonry" && masonryColumns ? (
        <ScrollArea className="flex-1 min-h-0">
          <div ref={scrollRef} className="flex gap-3 items-start pb-4">
            {masonryColumns.map((column, i) => (
              <div key={i} className="flex flex-1 min-w-0 flex-col gap-3">
                {column.map(renderCard)}
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div
            ref={scrollRef}
            className="grid gap-3 pb-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {renderItems.map(renderCard)}
          </div>
        </ScrollArea>
      )}

      {lightboxIndex !== null && filtered[lightboxIndex] && (
        <ImageLightbox
          images={filtered}
          allImages={images}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={onDelete}
          onImageUpdated={onImageUpdated}
          onUseAsReference={onUseAsReference}
          onUseAsPrompt={onUseAsPrompt}
          onRefine={onRefine}
        />
      )}
    </div>
  );
}
