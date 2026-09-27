"use client";

import { useCallback, useRef, useState } from "react";
import { Eraser, Paintbrush } from "lucide-react";
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

const MAX_DISPLAY = 480;

// The dialog uses `max-w-fit`, so nothing else caps its width — on a narrow viewport
// (mobile) a flat 480px display size would overflow the screen and force horizontal
// scroll. Shrink to fit the viewport (minus room for dialog padding/margins) instead.
function getMaxDisplay() {
  if (typeof window === "undefined") return MAX_DISPLAY;
  return Math.max(160, Math.min(MAX_DISPLAY, window.innerWidth - 64));
}

export function MaskEditor({
  open,
  onOpenChange,
  imageUrl,
  initialMask,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  initialMask?: File | null;
  onSave: (maskFile: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isPainting = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [brushSize, setBrushSize] = useState(40);
  const [displaySize, setDisplaySize] = useState({ width: MAX_DISPLAY, height: MAX_DISPLAY });
  const [ready, setReady] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const fillBlank = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
  }, []);

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

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (initialMask) {
      const maskUrl = URL.createObjectURL(initialMask);
      const maskImg = new Image();
      maskImg.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(maskUrl);
        setReady(true);
      };
      maskImg.onerror = () => {
        fillBlank(ctx, canvas.width, canvas.height);
        URL.revokeObjectURL(maskUrl);
        setReady(true);
      };
      maskImg.src = maskUrl;
      return;
    }

    fillBlank(ctx, canvas.width, canvas.height);
    setReady(true);
  }, [initialMask, fillBlank]);

  const attachImgRef = useCallback(
    (img: HTMLImageElement | null) => {
      imgRef.current = img;
      if (img?.complete && img.naturalWidth > 0) initCanvas();
    },
    [initCanvas]
  );

  function getCanvasPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function getDisplayPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function paintAt(x: number, y: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    const radius = (brushSize / 2) * scaleX;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (lastPoint.current) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = radius * 2;
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastPoint.current = { x, y };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    isPainting.current = true;
    lastPoint.current = null;
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (point) paintAt(point.x, point.y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const displayPoint = getDisplayPoint(e.clientX, e.clientY);
    if (displayPoint) setCursorPos(displayPoint);
    if (!isPainting.current) return;
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (point) paintAt(point.x, point.y);
  }

  function handlePointerUp() {
    isPainting.current = false;
    lastPoint.current = null;
  }

  function handlePointerLeave() {
    handlePointerUp();
    setCursorPos(null);
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onSave(new File([blob], "mask.png", { type: "image/png" }));
      onOpenChange(false);
    }, "image/png");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-fit sm:max-w-fit">
        <DialogHeader>
          <DialogTitle>Draw mask</DialogTitle>
          <DialogDescription>
            Paint over the areas you want to change. Everything left uncovered stays untouched.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto rounded-md overflow-hidden border bg-[repeating-conic-gradient(#00000010_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
          style={{ width: displaySize.width, height: displaySize.height }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={attachImgRef}
            src={imageUrl}
            alt="Mask target"
            className="absolute inset-0 size-full object-contain"
            onLoad={initCanvas}
          />
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 size-full touch-none cursor-none opacity-90 ${ready ? "" : "invisible"}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
          />
          {cursorPos && (
            <div
              className="pointer-events-none absolute rounded-full border-2 border-white mix-blend-difference"
              style={{
                width: brushSize,
                height: brushSize,
                left: cursorPos.x - brushSize / 2,
                top: cursorPos.y - brushSize / 2,
              }}
            />
          )}
        </div>

        <div className="flex min-w-0 items-center gap-3" style={{ width: displaySize.width }}>
          <Paintbrush className="size-3.5 text-muted-foreground shrink-0" />
          <Label className="text-xs shrink-0">Brush size</Label>
          <Slider
            value={[brushSize]}
            onValueChange={(v) => setBrushSize(Array.isArray(v) ? v[0] : v)}
            min={8}
            max={100}
            step={2}
            className="min-w-0 flex-1"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClear}>
            <Eraser className="size-3.5" /> Clear
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save mask
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
