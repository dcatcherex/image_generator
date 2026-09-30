"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImageRecord } from "@/lib/types";

// Delete removes the row and the Blob file for good (no undo), so every delete button asks
// first. Shows a thumbnail so it's obvious which image is about to go.
export function ConfirmDeleteDialog({
  image,
  open,
  onOpenChange,
  onConfirm,
}: {
  image: ImageRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete this image?</DialogTitle>
          <DialogDescription>This permanently deletes the image. It can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-md border">
            <Image src={image.blobUrl} alt={image.prompt} fill sizes="64px" className="object-cover" />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-3">{image.prompt}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} autoFocus>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
