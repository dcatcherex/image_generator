"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Sparkles, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODELS, QUALITY_OPTIONS, SIZE_OPTIONS } from "@/lib/openai";
import { estimateCost } from "@/lib/pricing";
import type { useImageStream } from "@/lib/use-image-stream";
import { referenceItemFromFile, type ReferenceItem } from "@/lib/reference-items";
import type { ImageRecord } from "@/lib/types";

export function GeneratePanel({
  onImageCreated,
  referenceItems,
  setReferenceItems,
  generateStream,
}: {
  onImageCreated: (image: ImageRecord) => void;
  referenceItems: ReferenceItem[];
  setReferenceItems: (items: ReferenceItem[]) => void;
  generateStream: ReturnType<typeof useImageStream>;
}) {
  const [mode, setMode] = useState<"generate" | "edit">("generate");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<string>("1024x1024");
  const [quality, setQuality] = useState<string>("medium");
  const [format, setFormat] = useState<string>("png");
  const [background, setBackground] = useState<string>("auto");
  const [model, setModel] = useState<string>(MODELS.generate);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { generate, isGenerating, error } = generateStream;

  const cost = useMemo(() => estimateCost(quality, size), [quality, size]);

  function handleModeChange(nextMode: "generate" | "edit") {
    setMode(nextMode);
    setModel(nextMode === "generate" ? MODELS.generate : MODELS.edit);
  }
  const busy = isGenerating || isEditing;

  async function handleSubmit() {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }

    if (mode === "generate") {
      await generate(
        { prompt, size, quality, format, background, model },
        (image) => {
          onImageCreated(image);
          toast.success("Image generated");
        }
      );
      if (error) toast.error(error);
      return;
    }

    if (referenceItems.length === 0) {
      toast.error("Add at least one reference image");
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
      <div className="shrink-0 p-4 pb-0">
        <Tabs value={mode} onValueChange={(v) => handleModeChange(v as "generate" | "edit")}>
          <TabsList className="w-full">
            <TabsTrigger value="generate" className="flex-1 gap-1.5">
              <Sparkles className="size-3.5" /> Generate
            </TabsTrigger>
            <TabsTrigger value="edit" className="flex-1 gap-1.5">
              <Wand2 className="size-3.5" /> Edit / Reference
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
        <div className="flex flex-1 min-h-24 flex-col gap-1.5">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === "generate"
                ? "A children's book illustration of a fox reading under a lantern..."
                : "Describe how to change the reference image(s)..."
            }
            className="field-sizing-fixed h-full flex-1 resize-none overflow-y-auto"
          />
        </div>

        {mode === "edit" && (
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
              Upload from disk, or click &ldquo;Use as reference&rdquo; on any gallery image.
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-4 p-4 pt-3 border-t">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Size</Label>
            <Select value={size} onValueChange={(v) => v && setSize(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
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
          <Label>Model</Label>
          <Select value={model} onValueChange={(v) => v && setModel(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={MODELS.generate}>{MODELS.generate}</SelectItem>
              <SelectItem value={MODELS.edit}>{MODELS.edit}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSubmit} disabled={busy} className="w-full gap-2 justify-between">
          <span className="flex items-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {mode === "generate" ? "Generate" : "Apply edit"}
          </span>
          <Badge
            variant="outline"
            className="font-mono text-[10px] border-primary-foreground/30 text-primary-foreground"
          >
            ~${cost.toFixed(3)}
          </Badge>
        </Button>
      </div>
    </div>
  );
}
