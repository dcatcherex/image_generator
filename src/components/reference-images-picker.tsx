"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REFERENCE_ROLES, defaultReferenceRole } from "@/lib/prompt-builder";
import { referenceItemFromFile, type ReferenceItem } from "@/lib/reference-items";
import { useFileDrop } from "@/lib/use-file-drop";
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
  const isImage = (f: File) => f.type.startsWith("image/");

  // Drops files that are already a reference (or repeated within this batch), matched by name,
  // size and modified time, so the same image can't be added twice.
  function withoutDuplicates(files: File[]): File[] {
    const id = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
    const seen = new Set(items.map((r) => id(r.file)));
    return files.filter((f) => {
      const k = id(f);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const imageFiles = withoutDuplicates(Array.from(files).filter(isImage));
    if (imageFiles.length === 0) return;
    onChange([...items, ...imageFiles.map(referenceItemFromFile)]);
  }

  const { isDraggingOver, dropProps } = useFileDrop({ accept: isImage, onFiles: addFiles });

  // Ctrl+V anywhere on the page adds a copied image or screenshot as a reference. Listening on
  // the window means no focus target is needed. Text pastes into a field are left alone, and
  // so is anything pasted inside an open dialog, which sits on top of this picker.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const data = e.clipboardData;
      if (!data) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[role="dialog"]')) return;
      const images = Array.from(data.files).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      const inTextField = !!target?.closest('input, textarea, [contenteditable="true"]');
      if (inTextField && data.types.includes("text/plain")) return;
      e.preventDefault();
      addFiles(images);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function updateItem(key: string, patch: Partial<ReferenceItem>) {
    onChange(items.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeItem(key: string) {
    onChange(items.filter((r) => r.key !== key));
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} {...dropProps}>
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
            {items.length > 1 && (
              <span className="absolute bottom-0.5 left-0.5 flex size-4 items-center justify-center rounded-full bg-background/80 text-[10px] font-medium">
                {items.indexOf(item) + 1}
              </span>
            )}
            <Button
              size="icon-xs"
              variant="secondary"
              onClick={() => removeItem(item.key)}
              className="absolute top-0.5 right-0.5 rounded-full bg-background/80 hover:bg-background"
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          title="Upload, drop, or paste (Ctrl+V) an image"
          className="size-16 rounded-md border border-dashed text-muted-foreground hover:bg-muted/50"
        >
          <Upload className="size-4" />
        </Button>
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

      {/* Roles only matter once there's more than one image to tell apart; a lone reference
          is implicitly the subject and stays frictionless. */}
      {items.length > 1 && (
        <div className="flex flex-col gap-1.5">
          {items.map((item, i) => {
            const role = REFERENCE_ROLES.find((r) => r.id === (item.role ?? defaultReferenceRole(i)))!;
            return (
              <div key={item.key} className="flex items-center gap-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                  {i + 1}
                </span>
                {/* SelectValue renders the raw value, so the label doubles as the value here. */}
                <Select
                  value={role.label}
                  onValueChange={(v) => {
                    const next = REFERENCE_ROLES.find((r) => r.label === v);
                    if (next) updateItem(item.key, { role: next.id });
                  }}
                >
                  <SelectTrigger size="sm" className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REFERENCE_ROLES.map((r) => (
                      <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={item.note ?? ""}
                  onChange={(e) => updateItem(item.key, { note: e.target.value })}
                  placeholder="Note (optional)"
                  maxLength={200}
                  className="h-8 min-w-0 flex-1 text-xs"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
