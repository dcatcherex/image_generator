"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Maximize, Paintbrush2, Sparkles, Upload, X } from "lucide-react";
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
import {
  ASPECT_RATIOS,
  MODEL_OPTIONS,
  N_OPTIONS,
  QUALITY_OPTIONS,
  sizeFromAspectRatio,
} from "@/lib/openai";
import { estimateCost, formatCostThb } from "@/lib/pricing";
import { ASSIGNABLE_TAGS } from "@/lib/tags";
import type { useImageStream } from "@/lib/use-image-stream";
import { referenceItemFromFile, type ReferenceItem } from "@/lib/reference-items";
import type { BatchJobRecord, ImageRecord } from "@/lib/types";

// OpenAI's real Batch API discount, applied to the same estimateCost() number.
const ECONOMY_DISCOUNT = 0.5;

// SelectValue in this codebase renders the raw selected value as its label (see how
// "png"/"medium" etc. display verbatim elsewhere), so the "no tag" sentinel needs to be
// human-readable itself rather than an internal token like "__none__".
const NO_TAG = "No tag";

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
  referenceItems,
  setReferenceItems,
  generateStream,
  isEditing,
  setIsEditing,
}: {
  onImageCreated: (image: ImageRecord) => void;
  onBatchSubmitted: (job: BatchJobRecord) => void;
  referenceItems: ReferenceItem[];
  setReferenceItems: (items: ReferenceItem[]) => void;
  generateStream: ReturnType<typeof useImageStream>;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("auto");
  const [quality, setQuality] = useState<string>("medium");
  const [format, setFormat] = useState<string>("webp");
  const [background, setBackground] = useState<string>("auto");
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0]);
  const [n, setN] = useState<number>(1);
  const [tag, setTag] = useState<string>(NO_TAG);
  const [economyMode, setEconomyMode] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskOwnerKey, setMaskOwnerKey] = useState<string | null>(null);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { generate, isGenerating, error } = generateStream;

  const isEditMode = referenceItems.length > 0;

  const size = useMemo(() => {
    const selected = ASPECT_RATIOS.find((ar) => ar.label === aspectRatio);
    return selected?.ratio ? sizeFromAspectRatio(selected.ratio[0], selected.ratio[1]) : "auto";
  }, [aspectRatio]);

  const cost = useMemo(() => {
    const base = estimateCost(quality, size) * (isEditMode ? 1 : n);
    return !isEditMode && economyMode ? base * ECONOMY_DISCOUNT : base;
  }, [quality, size, isEditMode, n, economyMode]);
  const maskableItem = referenceItems.length === 1 ? referenceItems[0] : null;
  const activeMask = maskableItem && maskableItem.key === maskOwnerKey ? maskFile : null;

  const busy = isGenerating || isEditing || isSubmittingBatch;

  async function handleSubmit() {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }

    const tagValue = tag === NO_TAG ? null : tag;

    if (!isEditMode && economyMode) {
      setIsSubmittingBatch(true);
      try {
        const res = await fetch("/api/batch/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, size, quality, format, background, model, n, tag: tagValue }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Batch submission failed");
        onBatchSubmitted(data.job);
        toast.success(
          `Batch submitted (${data.job.requestCount} image${data.job.requestCount > 1 ? "s" : ""}) — results in minutes to 24h`
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Batch submission failed");
      } finally {
        setIsSubmittingBatch(false);
      }
      return;
    }

    if (!isEditMode) {
      let created = 0;
      await generate(
        { prompt, size, quality, format, background, model, n, tag: tagValue },
        (image) => {
          onImageCreated(image);
          created++;
        }
      );
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
      toast.success("Image edited");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Edit failed");
    } finally {
      setIsEditing(false);
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const items = Array.from(files).map(referenceItemFromFile);
    setReferenceItems([...referenceItems, ...items]);
  }

  return (
    <div className="flex flex-col h-full min-h-0 border-b lg:border-b-0 lg:border-l bg-background">
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
          <Label>Reference images</Label>
          <div className="flex flex-wrap gap-2">
            {referenceItems.map((item) => (
              <div key={item.key} className="relative size-16 rounded-md overflow-hidden border">
                <Image src={item.previewUrl} alt="reference" fill className="object-cover" unoptimized />
                <button
                  onClick={() => setReferenceItems(referenceItems.filter((r) => r.key !== item.key))}
                  className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="size-16 rounded-md border border-dashed flex items-center justify-center text-muted-foreground hover:bg-muted/50"
            >
              <Upload className="size-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Upload from disk, or click &ldquo;Use as reference&rdquo; on any gallery image — adding one
            switches to editing automatically.
          </p>

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
        {!isEditMode && (
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
                    checked={economyMode}
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

        <div className="grid grid-cols-2 gap-3">
          {!isEditMode && (
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
          <div className="flex flex-col gap-1.5">
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
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Quality</Label>
            <Select value={quality} onValueChange={(v) => v && setQuality(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((q) => (
                  <SelectItem key={q} value={q}>{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => v && setFormat(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Background</Label>
            <Select value={background} onValueChange={(v) => v && setBackground(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="transparent">Transparent</SelectItem>
                <SelectItem value="opaque">Opaque</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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

        <div className="flex flex-col gap-1.5">
          <Label>Model</Label>
          <Select value={model} onValueChange={(v) => v && setModel(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSubmit} disabled={busy} className="w-full gap-2 justify-between">
          <span className="flex items-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isEditMode ? "Apply edit" : economyMode ? "Submit batch" : "Generate"}
          </span>
          <Badge
            variant="outline"
            className="font-mono text-[10px] border-primary-foreground/30 text-primary-foreground"
          >
            ~{formatCostThb(cost)}
          </Badge>
        </Button>
      </div>
    </div>
  );
}
