"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { GeneratePanel } from "@/components/generate-panel";
import { Gallery } from "@/components/gallery";
import { SettingsDialog } from "@/components/settings-dialog";
import { referenceItemFromImage, type ReferenceItem } from "@/lib/reference-items";
import { useImageStream } from "@/lib/use-image-stream";
import { ALL_TAGS_FILTER } from "@/lib/tags";
import type { BatchJobRecord, ImageRecord } from "@/lib/types";

// Client-side convenience poll interval while a tab is open and a batch is pending. The
// Vercel Cron job (see vercel.json + src/app/api/batch/cron) is the reliability backstop
// that keeps working even when no tab is open — this is purely for in-session responsiveness.
const BATCH_POLL_INTERVAL_MS = 45_000;

export default function Home() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS_FILTER);
  const [referenceItems, setReferenceItems] = useState<ReferenceItem[]>([]);
  const [pendingBatchJobs, setPendingBatchJobs] = useState<BatchJobRecord[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const generateStream = useImageStream();

  useEffect(() => {
    fetch("/api/images")
      .then((r) => r.json())
      .then((data) => setImages(data.images ?? []))
      .finally(() => setLoading(false));

    fetch("/api/batch")
      .then((r) => r.json())
      .then((data) => setPendingBatchJobs(data.jobs ?? []))
      .catch(() => {});
  }, []);

  // While any batch job is pending, poll for updates — polling (not persistent
  // background work) is required because Vercel serverless functions can't run a
  // long-lived loop; the interval clears itself once nothing is left pending.
  useEffect(() => {
    if (pendingBatchJobs.length === 0) return;

    const interval = setInterval(async () => {
      try {
        await fetch("/api/batch/poll", { method: "POST" });
        const [imagesRes, batchRes] = await Promise.all([
          fetch("/api/images").then((r) => r.json()),
          fetch("/api/batch").then((r) => r.json()),
        ]);
        setImages(imagesRes.images ?? []);
        setPendingBatchJobs(batchRes.jobs ?? []);
      } catch {
        // Transient network hiccup — the cron backstop and the next tick will catch up.
      }
    }, BATCH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pendingBatchJobs.length]);

  function handleBatchSubmitted(job: BatchJobRecord) {
    setPendingBatchJobs((prev) => [job, ...prev]);
  }

  function handleImageCreated(image: ImageRecord) {
    setImages((prev) => [image, ...prev]);
  }

  function handleDelete(image: ImageRecord) {
    setImages((prev) => prev.filter((i) => i.id !== image.id));
  }

  function handleImageUpdated(image: ImageRecord) {
    setImages((prev) => prev.map((i) => (i.id === image.id ? image : i)));
  }

  async function handleUseAsReference(image: ImageRecord) {
    const item = await referenceItemFromImage(image);
    setReferenceItems((prev) => [...prev, item]);
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 h-14 border-b shrink-0 bg-background">
        <h1 className="flex items-center gap-2">
          <ImageIcon className="size-4" />
          Image Studio
        </h1>
        <div className="flex items-center gap-3">
          <SettingsDialog />
          <UserButton />
        </div>
      </header>

      <div className="flex flex-col-reverse lg:flex-row-reverse flex-1 min-h-0">
        <div className="lg:w-[340px] shrink-0 flex flex-col max-h-[45vh] lg:max-h-none lg:h-full min-h-0 overflow-y-auto">
          <GeneratePanel
            onImageCreated={handleImageCreated}
            onBatchSubmitted={handleBatchSubmitted}
            referenceItems={referenceItems}
            setReferenceItems={setReferenceItems}
            generateStream={generateStream}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Loading gallery...
          </div>
        ) : (
          <Gallery
            images={images}
            onDelete={handleDelete}
            onImageUpdated={handleImageUpdated}
            onUseAsReference={handleUseAsReference}
            query={query}
            setQuery={setQuery}
            favoritesOnly={favoritesOnly}
            setFavoritesOnly={setFavoritesOnly}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            isGenerating={generateStream.isGenerating || isEditing}
            partialPreview={generateStream.partialB64}
            pendingCount={generateStream.pendingCount}
            pendingBatchJobs={pendingBatchJobs}
          />
        )}
      </div>
    </div>
  );
}
