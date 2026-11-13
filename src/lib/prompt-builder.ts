// Prompt assembly. The server is authoritative: routes receive structured `PromptInputs`,
// call `buildPrompt()`, send the result to OpenAI and store both the final text (`prompt`)
// and the raw inputs (`prompt_inputs`, so the UI can rehydrate them). All prompt wording
// lives in this file.

import type { BrandColor, LogoVariant } from "./brands";
import { resolveMentions } from "./mentions";

export type ReferenceRole = "subject" | "style" | "item" | "scene" | "logo" | "other";

export const REFERENCE_ROLES = [
  { id: "subject", label: "Subject", text: "subject to preserve" },
  { id: "style", label: "Style", text: "style reference — use only its palette, texture and visual medium" },
  { id: "item", label: "Clothing or item", text: "item to apply" },
  { id: "scene", label: "Scene or background", text: "scene/background to place things into" },
  {
    id: "logo",
    label: "Logo",
    text: "logo — reproduce it exactly as provided; do not alter its shape, proportions, colours or lettering",
  },
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

/** Which parts of the active brand a generation uses (the chips under the panel). */
export type BrandInclude = { palette: boolean; style: boolean; logo: boolean; standingText: boolean };

export const DEFAULT_BRAND_INCLUDE: BrandInclude = { palette: true, style: true, logo: false, standingText: false };

/**
 * The brand fields a prompt was built from, copied out of the brand at generation time so
 * old images stay reproducible after the brand is edited or deleted. Only what the enabled
 * chips used is kept (language always, since it applies whenever a brand is active).
 */
export type BrandSnapshot = {
  language: string;
  colors?: BrandColor[];
  style?: string;
  typeFeel?: string;
  dos?: string[];
  donts?: string[];
  standingText?: string;
};

export type BrandPromptInput = {
  id: string;
  name: string;
  section: BrandSnapshot;
  include: BrandInclude;
  logoVariant?: LogoVariant;
  // Re-skin only: the standing text replaces the source image's contact details.
  replaceContactInfo?: boolean;
};

export type PromptInputs = {
  base: string; // what the user typed
  exactText?: string;
  changeOnly?: string; // edit only
  preserve?: PreserveId[]; // edit only
  referenceRoles?: ReferenceRoleEntry[]; // edit only, in upload order (a brand logo is last)
  // Server-resolved from the brand id (see src/lib/brand-prompt.ts); never taken from the client.
  brand?: BrandPromptInput;
  // Set by /api/edit when a markup layer was uploaded with the request; never taken from the
  // client's promptInputs (sanitizePromptInputs drops it).
  markup?: boolean;
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
  // A logo always does: without it the model would treat a lone logo as the subject to edit.
  const roles = inputs.referenceRoles ?? [];
  if (roles.length >= 2 || roles.some((r) => r.note?.trim() || r.role === "logo")) {
    const lines = roles.map((r, i) => {
      const text = REFERENCE_ROLES.find((o) => o.id === r.role)?.text ?? "reference";
      const note = r.note?.trim();
      return `- Image ${i + 1}: ${text}${note ? ` — ${note}` : ""}`;
    });
    sections.push(`Inputs:\n${lines.join("\n")}`);
  }

  const exactText = inputs.exactText?.trim();
  const brandStandingText = inputs.brand?.include.standingText ? inputs.brand.section.standingText?.trim() : "";
  // When re-skinning with "Replace contact info", the standing text gets its own replacement
  // instruction instead of joining the text to add.
  const replacementText = inputs.brand?.replaceContactInfo ? brandStandingText : "";
  const standingText = replacementText ? "" : brandStandingText;

  if (inputs.brand) {
    const logoIndex = roles.findIndex((r) => r.role === "logo");
    // Preserved or contact-swapped source text (re-skins) must not be translated.
    const keepsExistingText = Boolean(inputs.preserve?.includes("text") || replacementText);
    sections.push(
      brandSection(inputs.brand, Boolean(exactText || standingText || replacementText), logoIndex, keepsExistingText)
    );
  }

  // @image1-style mentions from the prompt box become the guide's "image 1" wording.
  sections.push(resolveMentions(inputs.base.trim()));

  const changeOnly = inputs.changeOnly?.trim();
  if (changeOnly) sections.push(`Change only: ${changeOnly}`);

  if (inputs.markup) {
    sections.push(
      "Markup: Image 1 comes with a separate annotation layer. Its drawn marks (circles, arrows, scribbles) show where to apply the change. Apply it only there, keep everything else unchanged, and do not draw the marks in the result."
    );
  }

  const preserve = (inputs.preserve ?? [])
    .map((id): string | undefined => PRESERVE_OPTIONS.find((o) => o.id === id)?.text)
    .filter((t): t is string => Boolean(t));
  if (preserve.length > 0) {
    sections.push(
      `Constraints:\n- Preserve exactly: ${preserve.join("; ")}.\n- Do not add text, logos or watermarks unless requested.`
    );
  }

  if (exactText) {
    // Standing text (contact info etc.) joins the verbatim block rather than being "other text".
    const blocks = [exactText, standingText].filter(Boolean).map((t) => `"${t}"`);
    sections.push(
      `Text (render verbatim, ${blocks.length > 1 ? "each " : ""}exactly once, clearly legible; no other text):\n${blocks.join("\n")}`
    );
  } else if (standingText) {
    // Without exact text the base prompt may ask for its own headline, so no "no other text".
    sections.push(
      `Also include this text verbatim, exactly once, clearly legible (e.g. as a footer or contact line):\n"${standingText}"`
    );
  }

  if (replacementText) {
    sections.push(
      `Contact details: replace the existing contact details (phone numbers, LINE ID, website, address, social handles) with this text, verbatim, exactly once, in the same place:\n"${replacementText}"\nKeep all other text exactly as written.`
    );
  }

  return sections.join("\n\n");
}

// Brand fields are often pasted markdown lists. Each becomes one line, which reads better in
// the prompt and keeps the Brand section blank-line-free so stripBrandSection can find its end.
function oneLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const isList = lines.some((l) => /^[-*+]\s/.test(l));
  return lines.map((l) => l.replace(/^[-*+]\s+/, "").replace(/\*\*/g, "")).join(isList ? "; " : " ");
}

/** Removes the "Brand:" section from an assembled prompt (brands are owner-only data). */
export function stripBrandSection(prompt: string): string {
  return prompt.replace(/(^|\n\n)Brand: [^\n]*(\n- [^\n]*)*(\n\n|$)/, (_m, before, _l, after) =>
    before && after ? "\n\n" : ""
  );
}

function brandSection(
  brand: BrandPromptInput,
  hasVerbatimText: boolean,
  logoIndex: number,
  keepsExistingText: boolean
): string {
  const { section, include } = brand;
  const lines: string[] = [];

  // The Inputs line says how to treat the logo; this says to actually use it.
  if (include.logo && logoIndex >= 0) {
    lines.push(
      `- Logo: show the brand logo (Image ${logoIndex + 1}) once, clearly visible, where a logo naturally belongs unless the prompt says where.`
    );
  }

  if (include.palette && section.colors?.length) {
    const colors = section.colors.map((c) => {
      const usage = [c.role, c.note].filter((t): t is string => Boolean(t)).map(oneLine).join(": ");
      return `${c.hex}${usage ? ` (${usage})` : ""}`;
    });
    lines.push(`- Palette: ${colors.join("; ")}. Use these colours and no others for the design elements.`);
  }
  if (include.style) {
    if (section.style) lines.push(`- Style: ${oneLine(section.style)}`);
    if (section.typeFeel) lines.push(`- Typography feel: ${oneLine(section.typeFeel)}`);
    if (section.dos?.length) lines.push(`- Do: ${section.dos.map(oneLine).join("; ")}.`);
    if (section.donts?.length) lines.push(`- Don't: ${section.donts.map(oneLine).join("; ")}.`);
  }

  const lang = section.language;
  const thai = /^thai$/i.test(lang);
  lines.push(
    (keepsExistingText
      ? `- Keep existing text in its original language; write any new text in ${lang}`
      : `- Write all text in ${lang}`) +
      `${thai ? ", with correct spelling and tone marks" : ", spelled correctly"}` +
      `${include.style && section.typeFeel ? ", in the brand's typography feel" : ""}.` +
      (hasVerbatimText ? " Text given verbatim below stays exactly as written." : "")
  );

  return `Brand: ${oneLine(brand.name)}\n${lines.join("\n")}`;
}

/** Copies the brand fields the enabled chips use into a prompt snapshot. */
export function brandSnapshot(
  kit: { colors: BrandColor[]; style: string; typeFeel: string; dos: string[]; donts: string[]; standingText: string },
  language: string,
  include: BrandInclude
): BrandSnapshot {
  return {
    language,
    ...(include.palette && kit.colors.length ? { colors: kit.colors } : {}),
    ...(include.style && kit.style ? { style: kit.style } : {}),
    ...(include.style && kit.typeFeel ? { typeFeel: kit.typeFeel } : {}),
    ...(include.style && kit.dos.length ? { dos: kit.dos } : {}),
    ...(include.style && kit.donts.length ? { donts: kit.donts } : {}),
    ...(include.standingText && kit.standingText ? { standingText: kit.standingText } : {}),
  };
}

/** What the client may say about the brand: which one and which chips. The kit itself is
 * always loaded server-side from `id`. */
export type BrandRequest = {
  id: string;
  include: BrandInclude;
  logoVariant?: LogoVariant;
  replaceContactInfo?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGO_VARIANT_IDS = new Set(["primary", "on-dark", "icon"]);

export function sanitizeBrandRequest(raw: unknown): BrandRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !UUID_RE.test(r.id)) return null;
  const inc = (r.include && typeof r.include === "object" ? r.include : {}) as Record<string, unknown>;
  const flag = (key: keyof BrandInclude) => (typeof inc[key] === "boolean" ? inc[key] : DEFAULT_BRAND_INCLUDE[key]);
  const include: BrandInclude = {
    palette: flag("palette"),
    style: flag("style"),
    logo: flag("logo"),
    standingText: flag("standingText"),
  };
  const logoVariant =
    typeof r.logoVariant === "string" && LOGO_VARIANT_IDS.has(r.logoVariant) ? (r.logoVariant as LogoVariant) : undefined;
  return {
    id: r.id,
    include,
    ...(logoVariant ? { logoVariant } : {}),
    ...(r.replaceContactInfo === true ? { replaceContactInfo: true } : {}),
  };
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
