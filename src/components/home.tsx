"use client";

import { useEffect, useState } from "react";
import { ImageIcon, MessageSquare } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { GeneratePanel } from "@/components/generate-panel";
import { Gallery } from "@/components/gallery";
import { CompareDialog } from "@/components/compare-dialog";
import { HelpDialog } from "@/components/help-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ReadOnlyProvider } from "@/lib/read-only";
import { referenceItemFromImage, type ReferenceItem } from "@/lib/reference-items";
import { useImageStream } from "@/lib/use-image-stream";
import { useGalleryView } from "@/lib/use-gallery-view";
import { usePanelOptions } from "@/lib/use-panel-options";
import { ALL_TAGS_FILTER } from "@/lib/tags";
import type { PreserveId } from "@/lib/prompt-builder";
import type { BatchJobRecord, ImageRecord } from "@/lib/types";

// Client-side convenience poll interval while a tab is open and a batch is pending. The
// Vercel Cron job (see vercel.json + src/app/api/batch/cron) is the reliability backstop
// that keeps working even when no tab is open — this is purely for in-session responsiveness.
const BATCH_POLL_INTERVAL_MS = 45_000;

// Where the Feedback button points (e.g. a Google Form). The button is hidden when unset.
const FEEDBACK_URL = process.env.NEXT_PUBLIC_FEEDBACK_URL;

export function Home({ readOnly }: { readOnly: boolean }) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS_FILTER);
  const [referenceItems, setReferenceItems] = useState<ReferenceItem[]>([]);
  const [pendingBatchJobs, setPendingBatchJobs] = useState<BatchJobRecord[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [exactText, setExactText] = useState("");
  const [changeOnly, setChangeOnly] = useState("");
  const [preserve, setPreserve] = useState<PreserveId[]>([]);
  const [parentImageId, setParentImageId] = useState<string | null>(null);
  const generateStream = useImageStream();
  const compareStream = useImageStream();
  const [compareImages, setCompareImages] = useState<ImageRecord[] | null>(null);
  const galleryView = useGalleryView();
  const panelOptions = usePanelOptions();

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
        // Ingesting finished batches writes to the gallery, so only the owner triggers it;
        // viewers just refresh and rely on the cron backstop.
        if (!readOnly) await fetch("/api/batch/poll", { method: "POST" });
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
  }, [pendingBatchJobs.length, readOnly]);

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

  // Unlike "Use as reference" (which appends and sets no parent), Refine starts a fresh edit
  // of this one image: it replaces the references, carries the image's constraints forward
  // and remembers it as the parent so the versions chain can be rebuilt later.
  async function handleRefine(image: ImageRecord) {
    const item = await referenceItemFromImage(image);
    setReferenceItems([item]);
    setChangeOnly(image.promptInputs?.changeOnly ?? "");
    setPreserve(image.promptInputs?.preserve ?? []);
    setParentImageId(image.id);
    setPrompt("");
    setTimeout(() => document.getElementById("prompt")?.focus(), 0);
  }

  function handleUseAsPrompt(image: ImageRecord) {
    // Restore what the user typed, not the assembled text (older images have no inputs).
    const inputs = image.promptInputs;
    setPrompt(inputs?.base ?? image.prompt);
    setExactText(inputs?.exactText ?? "");
    // Only overwrite the edit constraints when the image actually recorded some, so using a
    // plain generate image's prompt mid-edit doesn't wipe the chips the user just picked.
    if (inputs?.changeOnly != null) setChangeOnly(inputs.changeOnly);
    if (inputs?.preserve) setPreserve(inputs.preserve);
  }

  // One placeholder tile per image still expected from each active stream (the first tile of a
  // stream shows its live partial frame, if preview is on); an edit shows a single tile.
  const pendingPreviews: Array<string | null> = [generateStream, compareStream].flatMap((s) =>
    s.isGenerating
      ? Array.from({ length: Math.max(s.pendingCount, 1) }, (_, i) => (i === 0 ? s.partialB64 : null))
      : []
  );
  if (isEditing && pendingPreviews.length === 0) pendingPreviews.push(null);

  return (
    <ReadOnlyProvider value={readOnly}>
    <div className="flex flex-col h-screen">
      <div className="flex flex-col-reverse lg:flex-row-reverse flex-1 min-h-0">
        <div className="lg:w-[340px] shrink-0 flex flex-col max-h-[45vh] lg:max-h-none lg:h-full min-h-0 border-b lg:border-b-0 lg:border-l bg-background">
          <div className="flex items-center justify-between px-4 h-14 border-b shrink-0">
            <h1 className="flex items-center gap-2">
              <ImageIcon className="size-4" />
              Image Studio
            </h1>
            <div className="flex items-center gap-3">
              {FEEDBACK_URL && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Send feedback"
                  title="Send feedback"
                  nativeButton={false}
                  render={<a href={FEEDBACK_URL} target="_blank" rel="noreferrer" />}
                >
                  <MessageSquare className="size-4" />
                </Button>
              )}
              <HelpDialog />
              <SettingsDialog
                view={galleryView.view}
                setView={galleryView.setView}
                columns={galleryView.columns}
                setColumns={galleryView.setColumns}
                panelVisibility={panelOptions.visibility}
                setPanelOptionVisible={panelOptions.setOptionVisible}
              />
              {!readOnly && <UserButton />}
            </div>
          </div>

          {readOnly && (
            <p className="px-4 py-2 border-b text-xs text-muted-foreground bg-muted/50">
              View-only beta — you can browse everything, but generating and editing are off.
              {FEEDBACK_URL && " Use the feedback button above to tell me what you think."}
            </p>
          )}

          <ScrollArea className="flex-1 min-h-0">
            {/* A disabled fieldset disables every control in the panel for viewers at once. */}
            <fieldset disabled={readOnly} className="min-w-0 border-0 p-0 m-0">
            <GeneratePanel
              onImageCreated={handleImageCreated}
              onBatchSubmitted={handleBatchSubmitted}
              prompt={prompt}
              setPrompt={setPrompt}
              referenceItems={referenceItems}
              setReferenceItems={setReferenceItems}
              generateStream={generateStream}
              compareStream={compareStream}
              onCompareDone={setCompareImages}
              exactText={exactText}
              setExactText={setExactText}
              changeOnly={changeOnly}
              setChangeOnly={setChangeOnly}
              preserve={preserve}
              setPreserve={setPreserve}
              parentImageId={parentImageId}
              setParentImageId={setParentImageId}
              visibility={panelOptions.visibility}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
            />
            </fieldset>
          </ScrollArea>
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
            onUseAsPrompt={handleUseAsPrompt}
            onRefine={handleRefine}
            query={query}
            setQuery={setQuery}
            favoritesOnly={favoritesOnly}
            setFavoritesOnly={setFavoritesOnly}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            pendingPreviews={pendingPreviews}
            pendingBatchJobs={pendingBatchJobs}
            view={galleryView.view}
            columns={galleryView.columns}
          />
        )}
      </div>

      {compareImages && (
        <CompareDialog
          images={compareImages}
          onClose={() => setCompareImages(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
    </ReadOnlyProvider>
  );
}
