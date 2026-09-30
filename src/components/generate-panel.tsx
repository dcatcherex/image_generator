"use client";

import { useMemo, useState } from "react";
import { Loader2, Maximize, Paintbrush2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
  modelShortName,
  N_OPTIONS,
  QUALITY_OPTIONS,
  SIZE_TIERS,
  sizeFromAspectRatio,
  type SizeTier,
} from "@/lib/openai";
import {
  BATCH_PRICE_MULTIPLIER,
  previewCostUsd,
  estimateCostCalibrated,
  formatCostThb,
} from "@/lib/pricing";
import { Input } from "@/components/ui/input";
import {
  PRESERVE_OPTIONS,
  defaultReferenceRole,
  type PreserveId,
  type PromptInputs,
} from "@/lib/prompt-builder";
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
  promptInputs: PromptInputs;
  size: string;
  quality: string;
  format: string;
  background: string;
  compression: number | null;
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
  compareStream,
  onCompareDone,
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
  // Second stream instance so the two comparison requests can run side by side.
  compareStream: ReturnType<typeof useImageStream>;
  onCompareDone: (images: ImageRecord[]) => void;
  visibility: PanelOptionVisibility;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
}) {
  const [aspectRatio, setAspectRatio] = useState<string>("auto");
  const [tier, setTier] = useState<SizeTier>("1K");
  const [quality, setQuality] = useState<string>("high");
  const [format, setFormat] = useState<string>("webp");
  const [background, setBackgroundState] = useState<string>("auto");
  // null = never moved, so nothing is sent and the API default applies.
  const [compressionValue, setCompression] = useState<number | null>(null);
  const [model, setModel] = useState<string>("gpt-image-2.5-sunburst");
  const [n, setN] = useState<number>(1);
  const [tag, setTag] = useState<string>(NO_TAG);
  const [economyModeOn, setEconomyMode] = useState(false);
  const [compareToggle, setCompareToggle] = useState(false);
  const [changeOnly, setChangeOnly] = useState("");
  const [preserve, setPreserve] = useState<PreserveId[]>([]);
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

  // Compression only exists for JPEG/WebP; hiding the slider also stops sending it.
  const compressionApplies = format !== "png";
  const compression = visibility.compression && compressionApplies ? compressionValue : null;

  // JPEG can't carry alpha, so picking Transparent while on JPEG falls back to PNG. (The
  // format/background selects also disable the conflicting option, so this is a backstop.)
  function setBackground(next: string) {
    if (next === "transparent" && format === "jpeg") {
      setFormat("png");
      toast.info("Switched to PNG — JPEG can't be transparent");
    }
    setBackgroundState(next);
  }
  // Only the instant single-image generate path streams; edits, batches (n > 1) and Economy
  // mode never do, so they never pay for previews.
  const previewApplies = !isEditMode && !economyMode && n === 1;
  // Comparing runs both models as instant single-image generations, so it has the same
  // preconditions as previews.
  const compareOn = visibility.compare && compareToggle && previewApplies;
  const previewOn = visibility.preview && livePreview.preview && previewApplies;
  const partials = previewOn ? PREVIEW_PARTIALS : 0;

  const size = useMemo(() => {
    const selected = ASPECT_RATIOS.find((ar) => ar.label === aspectRatio);
    return selected?.ratio ? sizeFromAspectRatio(selected.ratio[0], selected.ratio[1], tier) : "auto";
  }, [aspectRatio, tier]);

  const draft = useMemo(() => {
    const estimate = (m: string) =>
      estimateCostCalibrated(costStats.stats, m, quality, size, { partials, promptChars: prompt.length });
    const count = isEditMode ? 1 : n;
    const mult = !isEditMode && economyMode ? BATCH_PRICE_MULTIPLIER : 1;
    const estimates = compareOn ? MODEL.map(estimate) : [estimate(model)];
    return {
      usd: estimates.reduce((sum, e) => sum + e.usd, 0) * count * mult,
      approximate: estimates.some((e) => e.approximate),
    };
  }, [costStats.stats, model, quality, size, partials, prompt.length, isEditMode, n, economyMode, compareOn]);

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

  const busy = isGenerating || compareStream.isGenerating || isEditing || isSubmittingBatch;

  // What the server assembles the final prompt from (see buildPrompt); more fields join in
  // as the panel grows the matching inputs.
  const promptInputs: PromptInputs = {
    base: prompt,
    // Edit-only constraints; hiding the section in Settings also stops sending them.
    ...(isEditMode && visibility.preserve
      ? { changeOnly: changeOnly.trim() || undefined, preserve: preserve.length ? preserve : undefined }
      : {}),
  };

  function togglePreserve(id: PreserveId) {
    setPreserve((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleAddToQueue() {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    const tagValue = tag === NO_TAG ? null : tag;
    setQueue((q) => [
      ...q,
      { id: crypto.randomUUID(), prompt, promptInputs, size, quality, format, background, compression, model, n, tag: tagValue },
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
      const draft = prompt.trim() ? [{ prompt, promptInputs, size, quality, format, background, compression, model, n, tag: tagValue }] : [];
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

    if (compareOn) {
      // Same payload for both models, tied together by a client-made group id so the pair
      // can be found again later. Each stream reports into its own gallery tile.
      const compareGroupId = crypto.randomUUID();
      const payload = { promptInputs, size, quality, format, background, compression, n: 1, tag: tagValue, preview: previewOn, compareGroupId };
      const results: ImageRecord[] = [];
      await Promise.all(
        [generateStream, compareStream].map((stream, i) =>
          stream.generate({ ...payload, model: MODEL[i] }, (image, warning) => {
            onImageCreated(image);
            results.push(image);
            if (warning) toast.warning(warning);
          })
        )
      );
      costStats.refresh();
      if (results.length === MODEL.length) {
        // Order by MODEL so the dialog's left/right slots are stable.
        onCompareDone([...results].sort((a, b) => MODEL.indexOf(a.model as (typeof MODEL)[number]) - MODEL.indexOf(b.model as (typeof MODEL)[number])));
      } else {
        toast.error("One of the two models failed — the other image was kept in the gallery");
      }
      return;
    }

    if (!isEditMode) {
      let created = 0;
      await generate(
        { promptInputs, size, quality, format, background, compression, model, n, tag: tagValue, preview: previewOn },
        (image, warning) => {
          onImageCreated(image);
          created++;
          if (warning) toast.warning(warning);
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
      form.set(
        "promptInputs",
        JSON.stringify({
          ...promptInputs,
          referenceRoles: referenceItems.map((item, i) => ({
            role: item.role ?? defaultReferenceRole(i),
            ...(item.note?.trim() ? { note: item.note.trim() } : {}),
          })),
        })
      );
      form.set("size", size);
      form.set("quality", quality);
      form.set("format", format);
      form.set("background", background);
      if (compression != null) form.set("compression", String(compression));
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
      if (data.warning) toast.warning(data.warning);
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
          {isEditMode && visibility.preserve && (
            <div className="flex flex-col gap-2">
              <Input
                value={changeOnly}
                onChange={(e) => setChangeOnly(e.target.value)}
                placeholder="Change only… (e.g. the jacket)"
                aria-label="Change only"
                className="h-8 text-xs"
              />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preserve">
                {PRESERVE_OPTIONS.map((opt) => {
                  const on = preserve.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={on}
                      title={`Preserve: ${opt.text}`}
                      onClick={() => togglePreserve(opt.id)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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

        {visibility.compare && previewApplies && (
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="compare-models" className="text-sm">Compare models</Label>
              <span className="text-xs text-muted-foreground">
                {MODEL.map(modelShortName).join(" vs ")}, same settings
              </span>
            </div>
            <Switch
              id="compare-models"
              checked={compareToggle}
              onCheckedChange={(v) => setCompareToggle(Boolean(v))}
            />
          </div>
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
          {visibility.tier && <div className="flex flex-col gap-1.5">
            <Label>Size tier</Label>
            {/* Auto lets the model pick dimensions, so there's nothing for a tier to scale. */}
            <Select value={tier} onValueChange={(v) => v && setTier(v as SizeTier)} disabled={aspectRatio === "auto"}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIZE_TIERS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
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
                <SelectItem value="jpeg" disabled={background === "transparent"}>JPEG</SelectItem>
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
                <SelectItem value="transparent" disabled={format === "jpeg"}>Transparent</SelectItem>
                <SelectItem value="opaque">Opaque</SelectItem>
              </SelectContent>
            </Select>
          </div>}
        </div>

        {visibility.compression && compressionApplies && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Compression</Label>
              <span className="text-xs text-muted-foreground">
                {compressionValue == null ? "API default" : compressionValue}
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[compressionValue ?? 100]}
              onValueChange={(v) => setCompression(Array.isArray(v) ? v[0] : v)}
            />
          </div>
        )}

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

        {visibility.model && !compareOn && (
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
