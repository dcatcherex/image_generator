"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { modelShortName } from "@/lib/openai";
import { formatDuration, imageCostLabel } from "@/lib/pricing";
import type { ImageRecord } from "@/lib/types";

// Side-by-side result of a "Compare models" run. Both images are already saved; keeping one
// deletes the other (row + Blob) through the normal DELETE route.
export function CompareDialog({
  images,
  onClose,
  onDelete,
}: {
  images: ImageRecord[];
  onClose: () => void;
  onDelete: (image: ImageRecord) => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function keepOnly(keep: ImageRecord) {
    const other = images.find((i) => i.id !== keep.id);
    if (!other) return onClose();
    setDeletingId(other.id);
    try {
      const res = await fetch(`/api/images/${other.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDelete(other);
      onClose();
    } catch {
      toast.error(`Failed to delete the ${modelShortName(other.model)} image`);
      setDeletingId(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Model comparison</DialogTitle>
          <DialogDescription className="line-clamp-2">{images[0]?.prompt}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {images.map((image) => (
            <div key={image.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{modelShortName(image.model)}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {[
                    image.durationMs != null ? formatDuration(image.durationMs) : null,
                    imageCostLabel(image),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <Image
                src={image.blobUrl}
                alt={`${modelShortName(image.model)} result`}
                width={1000}
                height={1000}
                sizes="45vw"
                className="h-auto max-h-[60vh] w-full rounded-lg border object-contain"
                unoptimized
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deletingId !== null}>
            Keep both
          </Button>
          {images.map((image) => (
            <Button
              key={image.id}
              variant="secondary"
              onClick={() => keepOnly(image)}
              disabled={deletingId !== null}
            >
              {deletingId && deletingId !== image.id ? <Loader2 className="size-4 animate-spin" /> : null}
              Keep {modelShortName(image.model)}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
