"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { referenceItemFromFile, type ReferenceItem } from "@/lib/reference-items";
import { cn } from "cn";

export function ReferenceImagesPicker({
  items,
  onChange,
  label = "Reference images",
  className,
}: {
  items: ReferenceItem[];
  onChange: (items: ReferenceItem[]) => void;
  label?: string;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    onChange([...items, ...imageFiles.map(referenceItemFromFile)]);
  }

  function removeItem(key: string) {
    onChange(items.filter((r) => r.key !== key));
  }

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      {label && <Label>{label}</Label>}
      <div
        className={cn(
          "flex flex-wrap self-start gap-2 rounded-md p-1.5 -m-1.5 transition-colors",
          isDraggingOver && "bg-muted ring-2 ring-primary ring-offset-1"
        )}
      >
        {items.map((item) => (
          <div key={item.key} className="relative size-16 rounded-md overflow-hidden border">
            <Image src={item.previewUrl} alt="reference" fill className="object-cover" unoptimized />
            <button
              onClick={() => removeItem(item.key)}
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
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
