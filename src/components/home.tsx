"use client";

import { useEffect, useState } from "react";
import { ImageIcon, MessageSquare } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { GeneratePanel } from "@/components/generate-panel";
import { Gallery } from "@/components/gallery";
import { CompareDialog } from "@/components/compare-dialog";
import { HelpDialog } from "@/components/help-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { BrandSwitcher } from "@/components/brand-switcher";
import { BrandsDialog } from "@/components/brands-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ReadOnlyProvider } from "@/lib/read-only";
import { BrandsProvider } from "@/lib/brands-context";
import { toast } from "sonner";
import { referenceItemFromImage, type ReferenceItem } from "@/lib/reference-items";
import { useImageStream } from "@/lib/use-image-stream";
import { useGalleryView } from "@/lib/use-gallery-view";
import { usePanelOptions } from "@/lib/use-panel-options";
import { useBrands } from "@/lib/use-brands";
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
  const brandState = useBrands(!readOnly);
  const [brandsDialogOpen, setBrandsDialogOpen] = useState(false);

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
    warnIfBrandDiffers(image);
    const item = await referenceItemFromImage(image);
    setReferenceItems([item]);
    setChangeOnly(image.promptInputs?.changeOnly ?? "");
    setPreserve(image.promptInputs?.preserve ?? []);
    setParentImageId(image.id);
    setPrompt("");
    setTimeout(() => document.getElementById("prompt")?.focus(), 0);
  }

  // Refining uses the active brand's current settings, never the image's snapshot (BRANDS.md
  // decision 11). If that's a different brand, say so and offer to switch rather than switch
  // silently; if it's the same brand but edited since, say the current version applies.
  function warnIfBrandDiffers(image: ImageRecord) {
    const active = brandState.activeBrand;
    if (image.brandId && image.brandId !== active?.id) {
      const brand = brandState.brands.find((b) => b.id === image.brandId);
      if (!brand) return;
      toast.warning(`This image was made for ${brand.name}, but ${active ? active.name : "no brand"} is active`, {
        action: brand.archivedAt
          ? undefined
          : { label: `Use ${brand.name}`, onClick: () => brandState.setActive(brand.id) },
      });
    } else if (active && image.brandId === active.id && Date.parse(active.updatedAt) > Date.parse(image.createdAt)) {
      toast.info(`${active.name} has changed since this image was made — refining uses its current settings`);
    }
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
    <BrandsProvider value={brandState.brands}>
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

          {/* Outside the scroll area so the active brand stays visible (BRANDS.md decision 6). */}
          {!readOnly && (
            <div className="flex items-center gap-2 px-2 h-10 border-b shrink-0">
              <span className="pl-2 text-xs text-muted-foreground">Brand</span>
              <BrandSwitcher
                brands={brandState.brands}
                active={brandState.active}
                activeBrand={brandState.activeBrand}
                setActive={brandState.setActive}
                onManage={() => setBrandsDialogOpen(true)}
              />
            </div>
          )}

          {readOnly && (
            <p className="px-4 py-2 border-b text-xs text-muted-foreground bg-muted/50">
              View-only beta — you can browse everything, but generating and editing are off.
              {FEEDBACK_URL && " Use the feedback button above to tell me what you think."}
            </p>
          )}

          <ScrollArea className="flex-1 min-h-0">
            {/* A disabled fieldset disables every control in the panel for viewers at once. */}
            <fieldset disabled={readOnly} className="h-full min-w-0 border-0 p-0 m-0">
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
              activeBrand={brandState.activeBrand}
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
            brandFilter={brandState.active}
          />
        )}
      </div>

      {brandsDialogOpen && (
        <BrandsDialog
          brands={brandState.brands}
          initialBrandId={brandState.activeBrand?.id ?? null}
          onClose={() => setBrandsDialogOpen(false)}
          upsertBrand={brandState.upsertBrand}
          removeBrand={brandState.removeBrand}
        />
      )}

      {compareImages && (
        <CompareDialog
          images={compareImages}
          onClose={() => setCompareImages(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
    </BrandsProvider>
    </ReadOnlyProvider>
  );
}
