"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Download,
  FileUp,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandDot } from "@/components/brand-switcher";
import {
  DEFAULT_BRAND_LANGUAGE,
  EMPTY_BRAND_KIT,
  LOGO_VARIANTS,
  MAX_COLORS,
  type BrandKit,
  type BrandRecord,
  type LogoVariant,
} from "@/lib/brands";
import { brandToDesignMd, parseDesignMd, type ParsedBrand } from "@/lib/brand-design-md";
import { useFileDrop } from "@/lib/use-file-drop";
import { cn } from "cn";

const HEX = /^#[0-9a-f]{6}$/i;

const LOGO_LABELS: Record<LogoVariant, string> = {
  primary: "Primary",
  "on-dark": "On dark",
  icon: "Icon",
};

const LANGUAGE_SUGGESTIONS = ["Thai", "English", "Thai and English"];

// The form edits plain strings (do's/don'ts one per line) and converts on save, so typing a
// blank line or a half-finished hex never gets "corrected" under the cursor.
type FormState = {
  name: string;
  language: string;
  colors: { hex: string; role: string; note: string }[];
  typeFeel: string;
  style: string;
  dos: string;
  donts: string;
  standingText: string;
  notes: string;
};

function toForm(brand: ParsedBrand | null): FormState {
  const kit = brand?.kit ?? EMPTY_BRAND_KIT;
  return {
    name: brand?.name ?? "",
    language: brand?.language ?? DEFAULT_BRAND_LANGUAGE,
    colors: kit.colors.map((c) => ({ hex: c.hex, role: c.role, note: c.note ?? "" })),
    typeFeel: kit.typeFeel,
    style: kit.style,
    dos: kit.dos.join("\n"),
    donts: kit.donts.join("\n"),
    standingText: kit.standingText,
    notes: kit.notes,
  };
}

function fromForm(form: FormState): ParsedBrand {
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  const kit: BrandKit = {
    colors: form.colors.map((c) => ({
      hex: c.hex.trim().toUpperCase(),
      role: c.role.trim(),
      ...(c.note.trim() ? { note: c.note.trim() } : {}),
    })),
    typeFeel: form.typeFeel.trim(),
    style: form.style.trim(),
    dos: lines(form.dos),
    donts: lines(form.donts),
    standingText: form.standingText.trim(),
    notes: form.notes.trim(),
  };
  return { name: form.name.trim(), language: form.language.trim() || DEFAULT_BRAND_LANGUAGE, kit };
}

const NEW = "new";

export function BrandsDialog({
  brands,
  initialBrandId,
  onClose,
  upsertBrand,
  removeBrand,
}: {
  brands: BrandRecord[];
  initialBrandId: string | null;
  onClose: () => void;
  upsertBrand: (brand: BrandRecord) => void;
  removeBrand: (id: string) => void;
}) {
  // Mounted only while open, so this initial state is the "fresh open" state.
  const firstId = initialBrandId ?? brands.find((b) => !b.archivedAt)?.id ?? NEW;
  const [selectedId, setSelectedId] = useState<string>(firstId);
  const [form, setForm] = useState<FormState>(() => toForm(brands.find((b) => b.id === firstId) ?? null));
  const [showArchived, setShowArchived] = useState(
    () => brands.find((b) => b.id === firstId)?.archivedAt != null
  );
  const [busy, setBusy] = useState<null | "save" | "archive" | "delete" | LogoVariant>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = brands.find((b) => b.id === selectedId) ?? null;
  const isNew = selectedId === NEW;
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(selected));
  const active = brands.filter((b) => !b.archivedAt);
  const archived = brands.filter((b) => b.archivedAt);

  function select(id: string) {
    if (id === selectedId) return;
    if (dirty && !window.confirm("Discard unsaved changes to this brand?")) return;
    setSelectedId(id);
    setForm(toForm(brands.find((b) => b.id === id) ?? null));
    setImportOpen(false);
  }

  function patch(update: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  function patchColor(index: number, update: Partial<FormState["colors"][number]>) {
    setForm((prev) => ({
      ...prev,
      colors: prev.colors.map((c, i) => (i === index ? { ...c, ...update } : c)),
    }));
  }

  async function handleSave() {
    const data = fromForm(form);
    if (!data.name) return toast.error("Give the brand a name");
    if (data.kit.colors.some((c) => !HEX.test(c.hex))) {
      return toast.error("Colours must be 6-digit hex codes like #1F8A5B");
    }
    setBusy("save");
    try {
      const res = await fetch(isNew ? "/api/brands" : `/api/brands/${selectedId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      const brand: BrandRecord = json.brand;
      upsertBrand(brand);
      setSelectedId(brand.id);
      setForm(toForm(brand));
      toast.success(isNew ? `Created ${brand.name}` : `Saved ${brand.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleArchive(archive: boolean) {
    if (!selected) return;
    setBusy("archive");
    try {
      const res = await fetch(`/api/brands/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: archive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      upsertBrand(json.brand);
      if (archive) setShowArchived(true);
      toast.success(archive ? `Archived ${selected.name}` : `Restored ${selected.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeletePermanently() {
    if (!selected) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/brands/${selected.id}?permanent=true`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed");
      removeBrand(selected.id);
      const next = active.find((b) => b.id !== selected.id) ?? null;
      setSelectedId(next?.id ?? NEW);
      setForm(toForm(next));
      toast.success(`Deleted ${selected.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleLogoUpload(variant: LogoVariant, file: File) {
    if (!selected) return;
    setBusy(variant);
    try {
      const body = new FormData();
      body.set("variant", variant);
      body.set("file", file);
      const res = await fetch(`/api/brands/${selected.id}/logos`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      upsertBrand(json.brand);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleLogoRemove(variant: LogoVariant) {
    if (!selected) return;
    setBusy(variant);
    try {
      const res = await fetch(`/api/brands/${selected.id}/logos?variant=${variant}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to remove logo");
      upsertBrand(json.brand);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setBusy(null);
    }
  }

  // Import fills the form rather than saving straight away, so the user can check what the
  // best-effort parser understood (anything it didn't goes to Notes).
  function handleImport() {
    if (!importText.trim()) return;
    const parsed = parseDesignMd(importText);
    setForm(toForm(parsed));
    setImportOpen(false);
    setImportText("");
    toast.success("Imported DESIGN.md — review the fields, then Save");
  }

  // Exports the form as shown (including unsaved edits), so it works for a new brand too.
  function handleExport() {
    const data = fromForm(form);
    const blob = new Blob([brandToDesignMd({ ...data, name: data.name || "Untitled brand" })], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.name || "brand"} DESIGN.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && (!dirty || window.confirm("Discard unsaved changes?"))) onClose();
      }}
    >
      <DialogContent
        showCloseButton
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">Brands</DialogTitle>
        <div className="flex h-[620px] max-h-[85vh]">
          {/* Brand list */}
          <div className="flex w-40 shrink-0 flex-col border-r bg-muted/40 sm:w-48">
            <span className="px-5 pt-3 pb-2 text-xs font-medium text-muted-foreground">Brands</span>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-1 px-3 pb-3">
                {active.map((b) => (
                  <BrandListItem key={b.id} brand={b} selected={b.id === selectedId} onClick={() => select(b.id)} />
                ))}
                <button
                  type="button"
                  onClick={() => select(NEW)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-background/60",
                    isNew && "bg-background font-medium text-foreground shadow-sm"
                  )}
                >
                  <Plus className="size-4" />
                  New brand
                </button>

                {archived.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowArchived((v) => !v)}
                      className="mt-3 px-2 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showArchived ? "Hide" : "Show"} archived ({archived.length})
                    </button>
                    {showArchived &&
                      archived.map((b) => (
                        <BrandListItem
                          key={b.id}
                          brand={b}
                          selected={b.id === selectedId}
                          onClick={() => select(b.id)}
                          muted
                        />
                      ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Brand form */}
          <div className="flex min-w-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-5 p-5">
                <div className="flex items-center justify-between gap-3 pr-6">
                  <h3 className="truncate text-sm font-semibold">
                    {isNew ? "New brand" : selected?.name}
                    {selected?.archivedAt && (
                      <span className="ml-2 font-normal text-muted-foreground">(archived)</span>
                    )}
                  </h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setImportOpen((v) => !v)}>
                      <FileUp />
                      Import
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleExport}>
                      <Download />
                      Export
                    </Button>
                  </div>
                </div>

                {importOpen && <ImportPanel text={importText} setText={setImportText} onApply={handleImport} />}

                <div className="grid grid-cols-[1fr_9rem] gap-3">
                  <Field label="Name" htmlFor="brand-name">
                    <Input
                      id="brand-name"
                      value={form.name}
                      maxLength={80}
                      onChange={(e) => patch({ name: e.target.value })}
                      placeholder="Care Hub"
                    />
                  </Field>
                  <Field label="Text language" htmlFor="brand-language">
                    <Input
                      id="brand-language"
                      list="brand-language-options"
                      value={form.language}
                      maxLength={40}
                      onChange={(e) => patch({ language: e.target.value })}
                    />
                    <datalist id="brand-language-options">
                      {LANGUAGE_SUGGESTIONS.map((l) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  </Field>
                </div>

                <Field label="Colours" hint="Role says where it's used, e.g. primary, accent, background.">
                  <div className="flex flex-col gap-2">
                    {form.colors.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`Colour ${i + 1}`}
                          value={HEX.test(c.hex) ? c.hex.toLowerCase() : "#000000"}
                          onChange={(e) => patchColor(i, { hex: e.target.value.toUpperCase() })}
                          className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                        />
                        <Input
                          aria-label="Hex"
                          aria-invalid={!HEX.test(c.hex.trim())}
                          value={c.hex}
                          onChange={(e) => patchColor(i, { hex: e.target.value })}
                          className="w-24 shrink-0 font-mono text-xs"
                        />
                        <Input
                          aria-label="Role"
                          value={c.role}
                          maxLength={60}
                          onChange={(e) => patchColor(i, { role: e.target.value })}
                          placeholder="Role"
                          className="w-28 shrink-0"
                        />
                        <Input
                          aria-label="Usage note"
                          value={c.note}
                          maxLength={200}
                          onChange={(e) => patchColor(i, { note: e.target.value })}
                          placeholder="Where it's used"
                          className="min-w-0 flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove colour"
                          onClick={() => patch({ colors: form.colors.filter((_, j) => j !== i) })}
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      disabled={form.colors.length >= MAX_COLORS}
                      onClick={() => patch({ colors: [...form.colors, { hex: "#000000", role: "", note: "" }] })}
                    >
                      <Plus />
                      Add colour
                    </Button>
                  </div>
                </Field>

                <Field label="Style & mood" htmlFor="brand-style">
                  <Textarea
                    id="brand-style"
                    value={form.style}
                    maxLength={1000}
                    onChange={(e) => patch({ style: e.target.value })}
                    placeholder="Warm, caring and clean. Soft rounded shapes, friendly photography of real people, lots of white space."
                  />
                </Field>

                <Field
                  label="Typography feel"
                  htmlFor="brand-type"
                  hint="Describe it — image models can't use real fonts."
                >
                  <Textarea
                    id="brand-type"
                    value={form.typeFeel}
                    maxLength={500}
                    onChange={(e) => patch({ typeFeel: e.target.value })}
                    placeholder="Rounded, bold sans-serif headlines; light, airy body text."
                  />
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Do's" htmlFor="brand-dos" hint="One per line.">
                    <Textarea
                      id="brand-dos"
                      value={form.dos}
                      onChange={(e) => patch({ dos: e.target.value })}
                    />
                  </Field>
                  <Field label="Don'ts" htmlFor="brand-donts" hint="One per line.">
                    <Textarea
                      id="brand-donts"
                      value={form.donts}
                      onChange={(e) => patch({ donts: e.target.value })}
                    />
                  </Field>
                </div>

                <Field
                  label="Standing text"
                  htmlFor="brand-standing"
                  hint="Contact info, app name, LINE ID… rendered word-for-word when its chip is on."
                >
                  <Textarea
                    id="brand-standing"
                    value={form.standingText}
                    maxLength={1000}
                    onChange={(e) => patch({ standingText: e.target.value })}
                  />
                </Field>

                <Field label="Notes" htmlFor="brand-notes">
                  <Textarea
                    id="brand-notes"
                    value={form.notes}
                    maxLength={4000}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                </Field>

                <Field label="Logos" hint={isNew ? "Save the brand first to add logos." : "Drop or upload a PNG, JPEG or WebP, up to 4 MB. Dropping on a logo replaces it."}>
                  <div className="grid grid-cols-3 gap-3">
                    {LOGO_VARIANTS.map((variant) => (
                      <LogoSlot
                        key={variant}
                        variant={variant}
                        url={selected?.logos.find((l) => l.variant === variant)?.blobUrl ?? null}
                        disabled={isNew || busy !== null}
                        loading={busy === variant}
                        onUpload={(file) => handleLogoUpload(variant, file)}
                        onRemove={() => handleLogoRemove(variant)}
                      />
                    ))}
                  </div>
                </Field>
              </div>
            </ScrollArea>

            <div className="flex items-center gap-2 border-t px-5 py-3">
              {selected &&
                (selected.archivedAt ? (
                  <>
                    <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => handleArchive(false)}>
                      <ArchiveRestore />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={busy !== null}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 />
                      Delete permanently
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => handleArchive(true)}>
                    <Archive />
                    Archive
                  </Button>
                ))}
              <div className="ml-auto flex items-center gap-2">
                {dirty && !isNew && (
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setForm(toForm(selected))}>
                    Revert
                  </Button>
                )}
                <Button size="sm" disabled={!dirty || busy !== null} onClick={handleSave}>
                  {busy === "save" && <Loader2 className="animate-spin" />}
                  {isNew ? "Create brand" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {selected && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-sm" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Delete {selected.name} permanently?</DialogTitle>
              <DialogDescription>
                The brand and its logos are removed and its images become unbranded. Images keep a
                record of the brand settings they were made with. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)} autoFocus>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmDelete(false);
                  handleDeletePermanently();
                }}
              >
                Delete permanently
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

function BrandListItem({
  brand,
  selected,
  onClick,
  muted,
}: {
  brand: BrandRecord;
  selected: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background/60",
        muted && "text-muted-foreground",
        selected && "bg-background font-medium shadow-sm"
      )}
    >
      <BrandDot brand={brand} />
      <span className="truncate">{brand.name}</span>
    </button>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Browsers often report .md files with an empty MIME type, so go by extension first.
function isMarkdownFile(file: File): boolean {
  return /\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith("text/");
}

function ImportPanel({
  text,
  setText,
  onApply,
}: {
  text: string;
  setText: (v: string) => void;
  onApply: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const loadFile = async (file: File) => setText(await file.text());
  const { isDraggingOver, dropProps } = useFileDrop({
    accept: isMarkdownFile,
    onFiles: (files) => loadFile(files[0]),
  });
  return (
    <div
      {...dropProps}
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 transition-colors",
        isDraggingOver && "bg-muted ring-2 ring-primary ring-offset-1"
      )}
    >
      <p className="text-xs text-muted-foreground">
        Paste, drop or load a DESIGN.md. It replaces the fields below; anything that isn&apos;t
        recognised goes to Notes. Nothing is saved until you click Save.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"# Brand name\n\n## Colors\n- `#1F8A5B` primary — headlines, buttons"}
        className="max-h-60 min-h-24 font-mono text-xs"
      />
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await loadFile(file);
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          Load file…
        </Button>
        <Button size="sm" className="ml-auto" disabled={!text.trim()} onClick={onApply}>
          Apply to form
        </Button>
      </div>
    </div>
  );
}

// Same formats the logos route accepts (it sends logos on to the edit endpoint).
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

function isLogoFile(file: File): boolean {
  return LOGO_TYPES.includes(file.type);
}

function LogoSlot({
  variant,
  url,
  disabled,
  loading,
  onUpload,
  onRemove,
}: {
  variant: LogoVariant;
  url: string | null;
  disabled: boolean;
  loading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Dropping onto a filled slot replaces that variant, same as its Replace button.
  const { isDraggingOver, dropProps } = useFileDrop({
    accept: isLogoFile,
    onFiles: (files) => onUpload(files[0]),
    disabled,
  });
  return (
    <div className="flex flex-col gap-1.5">
      <div
        {...dropProps}
        className={cn(
          "relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border transition-shadow",
          // Show each variant on the background it's meant for.
          variant === "on-dark" ? "bg-neutral-900" : "bg-white",
          isDraggingOver && "ring-2 ring-primary ring-offset-1"
        )}
      >
        {url ? (
          <Image src={url} alt={`${LOGO_LABELS[variant]} logo`} fill sizes="160px" className="object-contain p-3" />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-1 text-xs text-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="size-4" />
            Drop or upload
          </button>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-muted-foreground">{LOGO_LABELS[variant]}</span>
        {url && (
          <div className="flex">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Replace ${LOGO_LABELS[variant]} logo`}
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
            >
              <Upload />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${LOGO_LABELS[variant]} logo`}
              disabled={disabled}
              onClick={onRemove}
            >
              <X />
            </Button>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={LOGO_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
