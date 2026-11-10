"use client";

import { useCallback, useRef, useState } from "react";
import { Eraser, Paintbrush, Pencil, Trash2, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "cn";

const MAX_DISPLAY = 480;
const MAX_UNDO = 20;

// Bright, high-contrast pen colors that rarely occur in photos, so the model can tell the
// marks from the picture. Red first, matching OpenAI's own markup example.
const COLORS = [
  { label: "Red", value: "#ff1f1f" },
  { label: "Yellow", value: "#ffd400" },
  { label: "Cyan", value: "#00d5ff" },
  { label: "Magenta", value: "#ff2bd6" },
] as const;

// Same viewport fitting as the mask editor: the dialog is `max-w-fit`, so cap the canvas.
function getMaxDisplay() {
  if (typeof window === "undefined") return MAX_DISPLAY;
  return Math.max(160, Math.min(MAX_DISPLAY, window.innerWidth - 64));
}

/**
 * Draws a markup layer for GPT Image markup-guided edits: a transparent PNG the size of the
 * first input image, with circles/arrows/scribbles showing where the prompt's change goes.
 * Unlike a mask (opaque with transparent holes), everything not drawn stays transparent.
 */
export function MarkupEditor({
  open,
  onOpenChange,
  imageUrl,
  initialMarkup,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  initialMarkup?: File | null;
  onSave: (markupFile: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const history = useRef<ImageData[]>([]);
  const [penSize, setPenSize] = useState(12);
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [erasing, setErasing] = useState(false);
  const [displaySize, setDisplaySize] = useState({ width: MAX_DISPLAY, height: MAX_DISPLAY });
  const [ready, setReady] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [emptyWarning, setEmptyWarning] = useState(false);

  const initCanvas = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const maxDisplay = getMaxDisplay();
    const scale = Math.min(maxDisplay / img.naturalWidth, maxDisplay / img.naturalHeight, 1);
    setDisplaySize({
      width: Math.round(img.naturalWidth * scale),
      height: Math.round(img.naturalHeight * scale),
    });

    // Natural size is after EXIF orientation, which is what the API compares against.
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    history.current = [];
    setCanUndo(false);
    setEmptyWarning(false);

    if (initialMarkup) {
      const url = URL.createObjectURL(initialMarkup);
      const markupImg = new Image();
      markupImg.onload = () => {
        ctx.drawImage(markupImg, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        setReady(true);
      };
      markupImg.onerror = () => {
        URL.revokeObjectURL(url);
        setReady(true);
      };
      markupImg.src = url;
      return;
    }
    setReady(true);
  }, [initialMarkup]);

  const attachImgRef = useCallback(
    (img: HTMLImageElement | null) => {
      imgRef.current = img;
      if (img?.complete && img.naturalWidth > 0) initCanvas();
    },
    [initCanvas]
  );

  function getContext() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    return canvas && ctx ? { canvas, ctx } : null;
  }

  function getCanvasPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function getDisplayPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : null;
  }

  function pushHistory() {
    const c = getContext();
    if (!c) return;
    history.current.push(c.ctx.getImageData(0, 0, c.canvas.width, c.canvas.height));
    if (history.current.length > MAX_UNDO) history.current.shift();
    setCanUndo(true);
  }

  function drawTo(x: number, y: number) {
    const c = getContext();
    if (!c) return;
    const { canvas, ctx } = c;
    // Pen size is in display pixels, so scale it up to the image's real resolution.
    const width = penSize * (canvas.width / canvas.getBoundingClientRect().width);
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = width;
    if (lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPoint.current = { x, y };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pushHistory();
    isDrawing.current = true;
    lastPoint.current = null;
    setEmptyWarning(false);
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (point) drawTo(point.x, point.y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const displayPoint = getDisplayPoint(e.clientX, e.clientY);
    if (displayPoint) setCursorPos(displayPoint);
    if (!isDrawing.current) return;
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (point) drawTo(point.x, point.y);
  }

  function handlePointerUp() {
    isDrawing.current = false;
    lastPoint.current = null;
  }

  function handlePointerLeave() {
    handlePointerUp();
    setCursorPos(null);
  }

  function handleUndo() {
    const c = getContext();
    const previous = history.current.pop();
    if (!c || !previous) return;
    c.ctx.putImageData(previous, 0, 0);
    setCanUndo(history.current.length > 0);
  }

  function handleClear() {
    const c = getContext();
    if (!c) return;
    pushHistory();
    c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
  }

  function hasMarks(): boolean {
    const c = getContext();
    if (!c) return false;
    const { data } = c.ctx.getImageData(0, 0, c.canvas.width, c.canvas.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // An empty layer would just be a plain edit; say so rather than send a blank markup.
    if (!hasMarks()) {
      setEmptyWarning(true);
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      onSave(new File([blob], "markup.png", { type: "image/png" }));
      onOpenChange(false);
    }, "image/png");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-fit sm:max-w-fit">
        <DialogHeader>
          <DialogTitle>Draw markup</DialogTitle>
          <DialogDescription>
            Circle or scribble on what to change, then describe the change in the prompt.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto overflow-hidden rounded-md border"
          style={{ width: displaySize.width, height: displaySize.height }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={attachImgRef}
            src={imageUrl}
            alt="Markup target"
            className="absolute inset-0 size-full object-contain"
            onLoad={initCanvas}
          />
          <canvas
            ref={canvasRef}
            className={cn("absolute inset-0 size-full touch-none cursor-none", !ready && "invisible")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
          />
          {cursorPos && (
            <div
              className="pointer-events-none absolute rounded-full border-2 border-white mix-blend-difference"
              style={{
                width: penSize,
                height: penSize,
                left: cursorPos.x - penSize / 2,
                top: cursorPos.y - penSize / 2,
              }}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3" style={{ width: displaySize.width }}>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Pen"
                aria-pressed={!erasing}
                className={cn("rounded-md", !erasing && "bg-foreground/10")}
                onClick={() => setErasing(false)}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Eraser"
                aria-pressed={erasing}
                className={cn("rounded-md", erasing && "bg-foreground/10")}
                onClick={() => setErasing(true)}
              >
                <Eraser className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-label={c.label}
                  aria-pressed={color === c.value && !erasing}
                  title={c.label}
                  onClick={() => {
                    setColor(c.value);
                    setErasing(false);
                  }}
                  className={cn(
                    "size-6 rounded-full border-2 border-transparent",
                    color === c.value && !erasing && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={handleUndo}
            >
              <Undo2 className="size-3.5" />
            </Button>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <Paintbrush className="size-3.5 shrink-0 text-muted-foreground" />
            <Label className="shrink-0 text-xs">Pen size</Label>
            <Slider
              value={[penSize]}
              onValueChange={(v) => setPenSize(Array.isArray(v) ? v[0] : v)}
              min={4}
              max={60}
              step={2}
              className="min-w-0 flex-1"
            />
          </div>
          {emptyWarning && (
            <p className="text-xs text-destructive">Draw at least one mark first.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClear}>
            <Trash2 className="size-3.5" /> Clear
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save markup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
