// Prompt assembly. The server is authoritative: routes receive structured `PromptInputs`,
// call `buildPrompt()`, send the result to OpenAI and store both the final text (`prompt`)
// and the raw inputs (`prompt_inputs`, so the UI can rehydrate them). All prompt wording
// lives in this file.

export type ReferenceRole = "subject" | "style" | "item" | "scene" | "other";

export const REFERENCE_ROLES = [
  { id: "subject", label: "Subject", text: "subject to preserve" },
  { id: "style", label: "Style", text: "style reference — use only its palette, texture and visual medium" },
  { id: "item", label: "Clothing or item", text: "item to apply" },
  { id: "scene", label: "Scene or background", text: "scene/background to place things into" },
  { id: "other", label: "Other", text: "reference" },
] as const satisfies ReadonlyArray<{ id: ReferenceRole; label: string; text: string }>;

export const PRESERVE_OPTIONS = [
  { id: "identity", label: "Face & identity", text: "face, facial features, skin tone, expression and identity" },
  { id: "pose", label: "Pose & body", text: "pose, body shape and proportions" },
  { id: "product", label: "Product & labels", text: "product geometry, label text and legibility" },
  { id: "layout", label: "Layout", text: "layout, composition and positions of all elements" },
  { id: "lighting", label: "Lighting & color", text: "lighting, shadows, color temperature, saturation and contrast" },
  { id: "camera", label: "Camera & framing", text: "camera angle, framing and perspective" },
  { id: "background", label: "Background", text: "background and surrounding objects" },
  { id: "text", label: "Existing text", text: "all existing text exactly as written" },
] as const;

export type PreserveId = (typeof PRESERVE_OPTIONS)[number]["id"];

export type ReferenceRoleEntry = { role: ReferenceRole; note?: string };

export type PromptInputs = {
  base: string; // what the user typed
  exactText?: string;
  changeOnly?: string; // edit only
  preserve?: PreserveId[]; // edit only
  referenceRoles?: ReferenceRoleEntry[]; // edit only, in upload order
};

/** Default role for the reference at `index`: the first is the subject, the rest "other". */
export function defaultReferenceRole(index: number): ReferenceRole {
  return index === 0 ? "subject" : "other";
}

/**
 * Assembles the final prompt. Sections are omitted when empty, and plain `base` comes back
 * unchanged when nothing else is set, so existing behaviour is preserved.
 */
export function buildPrompt(inputs: PromptInputs): string {
  const sections: string[] = [];

  // A lone reference with no note needs no explanation, so single-image edits stay untouched.
  const roles = inputs.referenceRoles ?? [];
  if (roles.length >= 2 || roles.some((r) => r.note?.trim())) {
    const lines = roles.map((r, i) => {
      const text = REFERENCE_ROLES.find((o) => o.id === r.role)?.text ?? "reference";
      const note = r.note?.trim();
      return `- Image ${i + 1}: ${text}${note ? ` — ${note}` : ""}`;
    });
    sections.push(`Inputs:\n${lines.join("\n")}`);
  }

  sections.push(inputs.base.trim());

  const changeOnly = inputs.changeOnly?.trim();
  if (changeOnly) sections.push(`Change only: ${changeOnly}`);

  const preserve = (inputs.preserve ?? [])
    .map((id): string | undefined => PRESERVE_OPTIONS.find((o) => o.id === id)?.text)
    .filter((t): t is string => Boolean(t));
  if (preserve.length > 0) {
    sections.push(
      `Constraints:\n- Preserve exactly: ${preserve.join("; ")}.\n- Do not add text, logos or watermarks unless requested.`
    );
  }

  const exactText = inputs.exactText?.trim();
  if (exactText) {
    sections.push(
      `Text (render verbatim, exactly once, clearly legible; no other text):\n"${exactText}"`
    );
  }

  return sections.join("\n\n");
}

const ROLE_IDS = new Set<string>(REFERENCE_ROLES.map((r) => r.id));
const PRESERVE_IDS = new Set<string>(PRESERVE_OPTIONS.map((o) => o.id));

/** Validates untrusted input (request JSON) into `PromptInputs`, or null if `base` is unusable. */
export function sanitizePromptInputs(raw: unknown): PromptInputs | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.base !== "string" || !r.base.trim()) return null;

  const inputs: PromptInputs = { base: r.base };
  if (typeof r.exactText === "string" && r.exactText.trim()) inputs.exactText = r.exactText.trim();
  if (typeof r.changeOnly === "string" && r.changeOnly.trim()) inputs.changeOnly = r.changeOnly.trim();
  if (Array.isArray(r.preserve)) {
    inputs.preserve = r.preserve.filter((id): id is PreserveId => typeof id === "string" && PRESERVE_IDS.has(id));
  }
  if (Array.isArray(r.referenceRoles)) {
    inputs.referenceRoles = r.referenceRoles.map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      const role = typeof e.role === "string" && ROLE_IDS.has(e.role) ? (e.role as ReferenceRole) : "other";
      const note = typeof e.note === "string" ? e.note.trim().slice(0, 200) : "";
      return note ? { role, note } : { role };
    });
  }
  return inputs;
}
