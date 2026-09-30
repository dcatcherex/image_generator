"use client";

import { useMemo, useState } from "react";
import { Loader2, Maximize, Paintbrush2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MaskEditor } from "@/components/mask-editor";
import { ReferenceImagesPicker } from "@/components/reference-images-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ASPECT_RATIOS,
  MODEL,
  N_OPTIONS,
  QUALITY_OPTIONS,
  sizeFromAspectRatio,
} from "@/lib/openai";
import {
  BATCH_PRICE_MULTIPLIER,
  previewCostUsd,
  estimateCostCalibrated,
  formatCostThb,
} from "@/lib/pricing";
import { useCostStats } from "@/lib/use-cost-stats";
import { useLivePreview } from "@/lib/use-live-preview";
import { ASSIGNABLE_TAGS } from "@/lib/tags";
import type { useImageStream } from "@/lib/use-image-stream";
import type { PanelOptionVisibility } from "@/lib/use-panel-options";
import type { ReferenceItem } from "@/lib/reference-items";
import type { BatchJobRecord, ImageRecord } from "@/lib/types";

// Streamed preview frames requested by /api/generate when Live preview is on. Keep in sync
// with PREVIEW_PARTIALS in src/app/api/generate/route.ts.
const PREVIEW_PARTIALS = 2;

// SelectValue in this codebase renders the raw selected value as its label (see how
// "png"/"medium" etc. display verbatim elsewhere), so the "no tag" sentinel needs to be
// human-readable itself rather than an internal token like "__none__".
const NO_TAG = "No tag";

// A queued Economy-mode prompt — each item keeps its own snapshot of settings (taken at
// the moment it was added), so later prompts can use different sizes/quality/etc without
// affecting ones already queued.
type QueuedPrompt = {
  id: string;
  prompt: string;
  size: string;
  quality: string;
  format: string;
  background: string;
  model: string;
  n: number;
  tag: string | null;
};

function AspectRatioIcon({ ratio }: { ratio: readonly [number, number] | null }) {
  if (!ratio) return <Maximize className="size-4" />;
  const [w, h] = ratio;
  const long = 16;
  const width = w >= h ? long : Math.round(long * (w / h));
  const height = h >= w ? long : Math.round(long * (h / w));
  return (
    <div className="flex h-4 items-center justify-center">
      <div className="rounded-[2px] border border-current" style={{ width, height }} />
    </div>
  );
}

export function GeneratePanel({
  onImageCreated,
  onBatchSubmitted,
  prompt,
  setPrompt,
  referenceItems,
  setReferenceItems,
  generateStream,
  visibility,
  isEditing,
  setIsEditing,
}: {
  onImageCreated: (image: ImageRecord) => void;
  onBatchSubmitted: (job: BatchJobRecord) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  referenceItems: ReferenceItem[];
  setReferenceItems: (items: ReferenceItem[]) => void;
  generateStream: ReturnType<typeof useImageStream>;
  visibility: PanelOptionVisibility;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
}) {
  const [aspectRatio, setAspectRatio] = useState<string>("auto");
  const [quality, setQuality] = useState<string>("high");
  const [format, setFormat] = useState<string>("webp");
  const [background, setBackground] = useState<string>("auto");
  const [model, setModel] = useState<string>("gpt-image-2.5-sunburst");
  const [n, setN] = useState<number>(1);
  const [tag, setTag] = useState<string>(NO_TAG);
  const [economyModeOn, setEconomyMode] = useState(false);
  // Hiding the Economy switch also turns the mode off, so a hidden toggle can't silently
  // keep routing generations through the slow batch path.
  const economyMode = visibility.economy && economyModeOn;
  const [queue, setQueue] = useState<QueuedPrompt[]>([]);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskOwnerKey, setMaskOwnerKey] = useState<string | null>(null);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);

  const { generate, isGenerating, error } = generateStream;
  const livePreview = useLivePreview();
  const costStats = useCostStats();

  const isEditMode = referenceItems.length > 0;
  // Only the instant single-image generate path streams; edits, batches (n > 1) and Economy
  // mode never do, so they never pay for previews.
  const previewApplies = !isEditMode && !economyMode && n === 1;
  const previewOn = visibility.preview && livePreview.preview && previewApplies;
  const partials = previewOn ? PREVIEW_PARTIALS : 0;

  const size = useMemo(() => {
    const selected = ASPECT_RATIOS.find((ar) => ar.label === aspectRatio);
    return selected?.ratio ? sizeFromAspectRatio(selected.ratio[0], selected.ratio[1]) : "auto";
  }, [aspectRatio]);

  const draft = useMemo(() => {
    const one = estimateCostCalibrated(costStats.stats, model, quality, size, {
      partials,
      promptChars: prompt.length,
    });
    const count = isEditMode ? 1 : n;
    const mult = !isEditMode && economyMode ? BATCH_PRICE_MULTIPLIER : 1;
    return { usd: one.usd * count * mult, approximate: one.approximate };
  }, [costStats.stats, model, quality, size, partials, prompt.length, isEditMode, n, economyMode]);

  // Queued items are only submitted (and thus only priced) in Economy mode, so no
  // separate "instant" branch is needed here the way the draft has one.
  const queueCost = useMemo(() => {
    if (isEditMode || !economyMode) return { usd: 0, approximate: false };
    return queue.reduce(
      (acc, item) => {
        const one = estimateCostCalibrated(costStats.stats, item.model, item.quality, item.size, {
          promptChars: item.prompt.length,
        });
        return {
          usd: acc.usd + one.usd * item.n * BATCH_PRICE_MULTIPLIER,
          approximate: acc.approximate || one.approximate,
        };
      },
      { usd: 0, approximate: false }
    );
  }, [costStats.stats, queue, isEditMode, economyMode]);

  const cost = draft.usd + queueCost.usd;
  // "~" only in front of table-based values; calibrated medians are real recorded costs.
  const costIsApproximate = draft.approximate || queueCost.approximate;

  const queuedImageCount = queue.reduce((sum, item) => sum + item.n, 0) + (!isEditMode && economyMode && prompt.trim() ? n : 0);

  const maskableItem = referenceItems.length === 1 ? referenceItems[0] : null;
  const activeMask = maskableItem && maskableItem.key === maskOwnerKey ? maskFile : null;

  const busy = isGenerating || isEditing || isSubmittingBatch;

  function handleAddToQueue() {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    const tagValue = tag === NO_TAG ? null : tag;
    setQueue((q) => [
      ...q,
      { id: crypto.randomUUID(), prompt, size, quality, format, background, model, n, tag: tagValue },
    ]);
    setPrompt("");
    toast.success("Added to queue");
  }

  function removeQueueItem(id: string) {
    setQueue((q) => q.filter((item) => item.id !== id));
  }

  async function handleSubmit() {
    const tagValue = tag === NO_TAG ? null : tag;

    if (!isEditMode && economyMode) {
      // The current draft (if any) is submitted alongside whatever's already queued,
      // without requiring an explicit "Add to queue" click first for the common
      // single-prompt case.
      const draft = prompt.trim() ? [{ prompt, size, quality, format, background, model, n, tag: tagValue }] : [];
      const requests = [...queue.map(({ id: _id, ...rest }) => rest), ...draft];
      if (requests.length === 0) {
        toast.error("Add a prompt to the queue first");
        return;
      }

      setIsSubmittingBatch(true);
      try {
        const res = await fetch("/api/batch/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Batch submission failed");
        onBatchSubmitted(data.job);
        toast.success(
          `Batch submitted (${data.job.requestCount} image${data.job.requestCount > 1 ? "s" : ""}) — results in minutes to 24h`
        );
        setQueue([]);
        setPrompt("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Batch submission failed");
      } finally {
        setIsSubmittingBatch(false);
      }
      return;
    }

    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }

    if (!isEditMode) {
      let created = 0;
      await generate(
        { prompt, size, quality, format, background, model, n, tag: tagValue, preview: previewOn },
        (image) => {
          onImageCreated(image);
          created++;
        }
      );
      costStats.refresh();
      if (error) {
        toast.error(error);
      } else if (created > 0) {
        toast.success(created > 1 ? `${created} images generated` : "Image generated");
      }
      return;
    }

    setIsEditing(true);
    try {
      const form = new FormData();
      form.set("prompt", prompt);
      form.set("size", size);
      form.set("quality", quality);
      form.set("format", format);
      form.set("background", background);
      form.set("model", model);
      form.set(
        "referenceImageIds",
        JSON.stringify(referenceItems.map((r) => r.sourceImageId).filter(Boolean))
      );
      referenceItems.forEach((item) => form.append("images", item.file));
      if (activeMask) form.set("mask", activeMask);
      if (tagValue) form.set("tag", tagValue);

      const res = await fetch("/api/edit", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Edit failed");
      onImageCreated(data.image);
      costStats.refresh();
      toast.success("Image edited");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Edit failed");
    } finally {
      setIsEditing(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
        <div className="flex flex-1 min-h-24 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="prompt">Prompt</Label>
            {isEditMode && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Paintbrush2 className="size-3" /> Editing {referenceItems.length} image
                {referenceItems.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isEditMode
                ? "Describe how to change the reference image(s)..."
                : "A children's book illustration of a fox reading under a lantern..."
            }
            className="field-sizing-fixed h-full flex-1 resize-none overflow-y-auto"
          />
        </div>

        <div className="shrink-0 flex flex-col gap-2">
          <ReferenceImagesPicker items={referenceItems} onChange={setReferenceItems} />

          {maskableItem && (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Paintbrush2 className="size-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 text-xs text-muted-foreground">
                {activeMask ? "Mask applied — only painted areas will change" : "No mask — the whole image may change"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setMaskEditorOpen(true)}
              >
                {activeMask ? "Edit mask" : "Draw mask"}
              </Button>
              {activeMask && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMaskFile(null)}
                >
                  Clear
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {maskableItem && (
        <MaskEditor
          open={maskEditorOpen}
          onOpenChange={setMaskEditorOpen}
          imageUrl={maskableItem.previewUrl}
          initialMask={activeMask}
          onSave={(file) => {
            setMaskFile(file);
            setMaskOwnerKey(maskableItem.key);
          }}
        />
      )}

      <div className="shrink-0 flex flex-col gap-4 p-4 pt-3 border-t">
        {!isEditMode && visibility.economy && (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="economy-mode" className="text-sm">Economy mode</Label>
                    <Badge variant="secondary" className="text-[10px]">~50% cheaper</Badge>
                  </div>
                  <Switch
                    id="economy-mode"
                    checked={economyModeOn}
                    onCheckedChange={(v) => setEconomyMode(Boolean(v))}
                  />
                </div>
              }
            />
            <TooltipContent>
              ~50% cheaper via OpenAI&rsquo;s Batch API — results may take minutes up to 24 hours
              instead of appearing instantly.
            </TooltipContent>
          </Tooltip>
        )}

        {visibility.preview && previewApplies && (
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="live-preview" className="text-sm">Live preview</Label>
              <span className="text-xs text-muted-foreground">
                +{formatCostThb(previewCostUsd(PREVIEW_PARTIALS))} per image
              </span>
            </div>
            <Switch
              id="live-preview"
              checked={livePreview.preview}
              onCheckedChange={(v) => livePreview.setPreview(Boolean(v))}
            />
          </div>
        )}

        {!isEditMode && economyMode && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Prompt queue</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleAddToQueue}
              >
                <Plus className="size-3" /> Add to queue
              </Button>
            </div>
            {queue.length > 0 && (
              <ScrollArea className="max-h-40">
                <div className="flex flex-col gap-1.5 pr-2">
                  {queue.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 rounded-md bg-muted/50 p-1.5 text-xs">
                      <span className="flex-1 line-clamp-2 text-foreground/90">{item.prompt}</span>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => removeQueueItem(item.id)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            <p className="text-xs text-muted-foreground">
              Add different prompts to the queue, then submit them all as one batch job.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {!isEditMode && visibility.batch && (
            <div className="flex flex-col gap-1.5">
              <Label>Batch (n)</Label>
              <Select value={String(n)} onValueChange={(v) => v && setN(Number(v))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {N_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {visibility.size && <div className="flex flex-col gap-1.5">
            <Label>Size {size !== "auto" && <span className="text-muted-foreground font-normal">({size})</span>}</Label>
            <Select value={aspectRatio} onValueChange={(v) => v && setAspectRatio(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((ar) => (
                  <SelectItem key={ar.label} value={ar.label}>
                    <span className="flex items-center gap-2">
                      <AspectRatioIcon ratio={ar.ratio} />
                      {ar.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}
          {visibility.quality && <div className="flex flex-col gap-1.5">
            <Label>Quality</Label>
            <Select value={quality} onValueChange={(v) => v && setQuality(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((q) => (
                  <SelectItem key={q} value={q}>{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}
          {visibility.format && <div className="flex flex-col gap-1.5">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => v && setFormat(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>}
          {visibility.background && <div className="flex flex-col gap-1.5">
            <Label>Background</Label>
            <Select value={background} onValueChange={(v) => v && setBackground(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="transparent">Transparent</SelectItem>
                <SelectItem value="opaque">Opaque</SelectItem>
              </SelectContent>
            </Select>
          </div>}
        </div>

        {visibility.tag && (
          <div className="flex flex-col gap-1.5">
            <Label>Tag</Label>
            <Select value={tag} onValueChange={(v) => v && setTag(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TAG}>{NO_TAG}</SelectItem>
                {ASSIGNABLE_TAGS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {visibility.model && (
          <div className="flex flex-col gap-1.5">
            <Label>Model</Label>
            <Select value={model} onValueChange={(v) => v && setModel(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODEL.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button onClick={handleSubmit} disabled={busy} className="w-full gap-2 justify-between">
          <span className="flex items-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isEditMode
              ? "Apply edit"
              : economyMode
              ? `Submit batch${queuedImageCount > 1 ? ` (${queuedImageCount})` : ""}`
              : "Generate"}
          </span>
          <Badge
            variant="outline"
            className="font-mono text-[10px] border-primary-foreground/30 text-primary-foreground"
          >
            {costIsApproximate ? "~" : ""}{formatCostThb(cost)}
          </Badge>
        </Button>
      </div>
    </div>
  );
}
