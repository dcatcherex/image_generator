"use client";

import { useState } from "react";
import { Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ASSIST_MODE_LABELS, CONTEXT_CHIPS, type AssistMode } from "@/lib/prompt-assist";
import type { ReferenceRoleEntry } from "@/lib/prompt-builder";

/**
 * "AI assist" for the prompt box: fills <placeholders>, rewrites the prompt with the GPT Image
 * prompting guide's best practices, adapts it to a context (Thai, a province, a style...), or
 * writes one from an idea. The result replaces the prompt, with Undo in the toast.
 */
export function PromptAssistDialog({
  open,
  onOpenChange,
  prompt,
  setPrompt,
  placeholderCount,
  isEdit,
  references,
  hasMarkup,
  language,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  placeholderCount: number;
  isEdit: boolean;
  references: ReferenceRoleEntry[];
  hasMarkup: boolean;
  language: string | null;
}) {
  // Kept across openings so the same context can be reused on the next sheet / prompt.
  const [context, setContext] = useState("");
  const [running, setRunning] = useState<AssistMode | null>(null);
  const hasPrompt = prompt.trim().length > 0;
  const hasContext = context.trim().length > 0;

  function addChip(chip: string) {
    setContext((c) => {
      if (c.toLowerCase().includes(chip.toLowerCase())) return c;
      return c.trim() ? `${c.trim().replace(/[,;]$/, "")}, ${chip}` : chip;
    });
  }

  async function run(mode: AssistMode) {
    setRunning(mode);
    const before = prompt;
    try {
      const res = await fetch("/api/prompt-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, prompt, context, isEdit, references, hasMarkup, language }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.prompt !== "string") {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setPrompt(data.prompt);
      onOpenChange(false);
      toast.success(`${ASSIST_MODE_LABELS[mode]}: prompt updated`, {
        action: { label: "Undo", onClick: () => setPrompt(before) },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Prompt assist failed");
    } finally {
      setRunning(null);
    }
  }

  const actions: { mode: AssistMode; enabled: boolean; hint: string }[] = [
    {
      mode: "fill",
      enabled: placeholderCount > 0,
      hint:
        placeholderCount > 0
          ? `Replaces the ${placeholderCount} highlighted placeholder${placeholderCount > 1 ? "s" : ""}, keeps the rest`
          : "No placeholders in the prompt",
    },
    {
      mode: "improve",
      enabled: hasPrompt,
      hint: hasPrompt ? "Restructures it per the GPT Image prompting guide" : "Write a prompt first",
    },
    {
      mode: "context",
      enabled: hasPrompt && hasContext,
      hint: !hasPrompt ? "Write a prompt first" : hasContext ? "Weaves the context above into the prompt" : "Add context above first",
    },
    {
      mode: "write",
      enabled: hasContext,
      hint: hasContext ? (hasPrompt ? "Replaces the prompt with a new one from your idea" : "Writes a full prompt from your idea") : "Describe your idea above first",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="flex items-center gap-2">
          <WandSparkles className="size-4" /> AI prompt assist
        </DialogTitle>
        <DialogDescription>
          Uses the GPT Image prompting best practices. The result replaces the prompt — Undo is in the notification.
        </DialogDescription>

        <div className="flex flex-col gap-2">
          <Label htmlFor="assist-context">Context or idea (optional)</Label>
          <Textarea
            id="assist-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Thai, Chiang Mai, a lazy cat who loves som tam, office worker humor, watercolor"
            className="min-h-20 resize-y"
          />
          <div className="flex flex-wrap gap-1.5">
            {CONTEXT_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => addChip(chip)}
                className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                + {chip}
              </button>
            ))}
          </div>
          {references.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Knows your {references.length} reference images by number and uses their roles and notes — set those below the prompt for better results.
            </p>
          )}
          {language && (
            <p className="text-xs text-muted-foreground">Brand language: {language} (used for captions and in-image text)</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {actions.map((a) => (
            <Button
              key={a.mode}
              type="button"
              variant={a.mode === "fill" && a.enabled ? "default" : "outline"}
              disabled={!a.enabled || running !== null}
              onClick={() => run(a.mode)}
              className="h-auto justify-start py-2 text-left"
            >
              {running === a.mode ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <WandSparkles className="size-4 shrink-0" />}
              <span className="flex flex-col items-start">
                <span>{ASSIST_MODE_LABELS[a.mode]}</span>
                <span className="text-xs font-normal opacity-70 whitespace-normal">{a.hint}</span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
