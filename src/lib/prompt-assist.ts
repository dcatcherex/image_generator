import { REFERENCE_ROLES, type ReferenceRoleEntry } from "./prompt-builder";

// AI prompt assist: a text model rewrites the panel's prompt following the GPT Image prompting
// guide (src/docs/gpt-image-2.6-prompting guide.md, condensed below) and, for LINE stickers,
// the sticker playbook (src/docs/line-sticker-playbook.md). Shared by the API route and panel.

export const ASSIST_MODES = ["fill", "improve", "context", "write"] as const;
export type AssistMode = (typeof ASSIST_MODES)[number];

export const ASSIST_MODE_LABELS: Record<AssistMode, string> = {
  fill: "Fill placeholders",
  improve: "Improve with best practices",
  context: "Apply context",
  write: "Write from idea",
};

/** Quick context chips the assist dialog offers; each appends its text to the context box. */
export const CONTEXT_CHIPS = [
  "Thai culture & setting",
  "Thai captions",
  "English captions",
  "Bangkok",
  "Chiang Mai",
  "Phuket",
  "Isan",
  "Cute & playful",
  "Funny / office humor",
  "Premium & minimal",
  "Photorealistic",
  "Watercolor",
  "Flat vector",
  "3D clay",
] as const;

/** The text model that writes prompts; overridable since accounts differ in what they can call. */
export function assistModel(): string {
  return (process.env.OPENAI_PROMPT_MODEL ?? "gpt-6-luna").trim() || "gpt-6-luna";
}

const GUIDE = `You are an expert prompt writer for OpenAI's GPT Image 2.6 image model (Sunburst / Flare).
Apply these best practices from the official GPT Image 2.6 prompting guide:

1. Define the result: name the subject and intended use (product photo, ad, sticker, diagram...). Specify composition, aspect/orientation and important placement constraints. For complex requests organise the prompt into labeled sections such as Scene / Subject / Details / Style / Constraints (or Type / Character / Layout / Style / Constraints).
2. Choose a maintainable format: short labeled lines or paragraphs that are easy to read and edit. No special syntax, no prompt-weighting tricks, no "8k, masterpiece, trending" tag soup.
3. Describe visible details: materials, lighting, colors, texture, visual medium. Say "photorealistic" or "real photograph" explicitly when that is the goal. Describe framing and lens as appearance cues. For cinematic / low-light / rainy / neon scenes, specify scale, atmosphere and color rather than mood words alone.
4. People and actions: body framing, relative scale, gaze, interaction with objects ("full body visible, feet included", "looking down at the open book", "hands gripping the handlebars").
5. Exact text: put required wording in double quotes, say where it goes and its typography, say it appears exactly once, and add "no extra text". Spell unusual words/brand names carefully. Keep in-image text short.
6. Edits: say "change only X" and list what must be preserved (identity, face, geometry, layout, lighting, labels, camera angle, background). State exclusions (no extra text, logos, watermarks).
7. Reference images: identify each input by number and role (subject, style, clothing, background) and say how they combine.
8. Character consistency: repeat the character's defining traits (silhouette, primary colors, signature accessory, proportions) and say "do not redesign the character".
9. Transparent assets: ask for an isolated subject on a fully transparent background, clean alpha edges, "no solid backdrop, checkerboard, scenery or shadow".
10. Real-world / historical context: name the place and period and ask for accurate clothing, architecture and details.
11. Logos / originality: ask for an original, non-infringing design; no trademarks or copyrighted characters.
12. Infographics, slides, diagrams: write it like an artifact spec — title, hierarchy, the real labels/numbers, readable typography, no decorative clutter.`;

const STICKER_TIPS = `LINE sticker rules (from the project's LINE sticker playbook and LINE's review guideline):
- Every sticker shows the character doing something expressive — never text-only or object-only.
- Make each one useful in chat: reactions, replies, feelings (greetings, thanks, OK, sorry, LOL, crying, angry, love, tired, on my way, busy, good night...).
- Vary poses, expressions and emotions across the set; no two stickers alike. Avoid tall full-length poses; big head, small body reads best.
- Captions are short (1–3 words), each in double quotes, written exactly as they should appear. No URLs, app names, ads or emoji characters in captions.
- Pose descriptions are concrete and visual: body action + facial expression + one small prop or effect (e.g. "Melting into a puddle, flattened body, eyes half closed").`;

const MODE_TASKS: Record<AssistMode, string> = {
  fill: `TASK: Fill in every placeholder in the prompt. Placeholders look like <...> or [...]. Replace each one (including its brackets) with concrete, specific content that fits the rest of the prompt, the user's context and the image's purpose. Keep ALL other text exactly as written — same wording, order, line breaks and numbering. When a list has several similar placeholders (e.g. 8 stickers), make every entry different and varied. No placeholder may remain.`,
  improve: `TASK: Rewrite the prompt so it follows the best practices above. Keep the user's intent, subject, any quoted text and any concrete details. Add what is missing (purpose, composition, lighting/medium, constraints, exact-text rules), organise it into labeled sections when it is more than a sentence or two, and remove vague filler. If the prompt contains placeholders (<...> or [...]) that you cannot fill confidently, keep them; otherwise fill them.`,
  context: `TASK: Adapt the prompt to the user's context (for example a culture, country, province/region, characteristics, audience, language or style). Weave the context in concretely: local scenery, architecture, food, clothing, festivals, landmarks, colors and motifs that genuinely belong to it — specific and respectful, not stereotyped. Keep the prompt's structure, intent and any quoted text that is not affected. If the context names a caption language, write the captions in that language. Fill any placeholders the context lets you fill.`,
  write: `TASK: Write a complete, ready-to-use image prompt from the user's idea and context, following the best practices above. Use labeled sections. Make reasonable creative choices instead of leaving placeholders.`,
};

export type AssistRequest = {
  mode: AssistMode;
  prompt: string;
  context: string;
  isEdit: boolean;
  /** The active brand's language, used when the prompt asks for captions/text. */
  language: string | null;
  /** The reference images' roles and notes, in upload order (image 1 first). */
  references: ReferenceRoleEntry[];
  /** A markup overlay (circled areas) is attached to image 1. */
  hasMarkup: boolean;
};

const REFERENCE_RULES = `Reference image rules:
- The model cannot see the app's thumbnails; it only knows the images by their order. Refer to them ONLY as "image 1", "image 2", "image 3"... — never "the left picture", "the boy photo", "the first upload".
- Image 1 is the main image being edited; the result keeps its framing unless told otherwise.
- The app automatically prepends an "Inputs:" list stating each image's role and note, so do NOT write an "Inputs:" / "Reference images:" list yourself. In the prompt, say what to TAKE from each image and how they combine (e.g. "the pose from image 2, the outfit from image 3, everything else from image 1"), where each element goes in the result, and what must stay unchanged.
- With several characters/subjects, give each one its position (left / middle / right, foreground / background) and say to keep each one's hair, outfit, colors and proportions exactly as in its own image.
- A "style" image contributes only palette, texture and medium — never its subject. A "logo" image must be reproduced exactly.`;

function describeReferences(refs: ReferenceRoleEntry[], hasMarkup: boolean): string {
  const lines = refs.map((r, i) => {
    const text = REFERENCE_ROLES.find((o) => o.id === r.role)?.text ?? "reference";
    const note = r.note?.trim();
    return `- Image ${i + 1}: ${text}${note ? ` — ${note}` : ""}`;
  });
  if (hasMarkup) lines.push("- Image 1 has a markup overlay: the circled/marked areas show what to change (say \"the area circled in the markup\" and ask to remove the marks from the result).");
  return lines.join("\n");
}

export function assistInstructions(req: AssistRequest): string {
  const sticker = /sticker|line messenger/i.test(req.prompt) || /sticker/i.test(req.context);
  const parts = [GUIDE];
  if (sticker) parts.push(STICKER_TIPS);
  parts.push(MODE_TASKS[req.mode]);
  if (req.isEdit && req.references.length > 0) {
    const n = req.references.length;
    parts.push(
      n === 1
        ? `This is an EDIT of one input image ("the reference image" / "image 1"). Keep edit-style wording: say what to change only, and what to preserve.`
        : `This is an EDIT with ${n} input images.\n\n${REFERENCE_RULES}`,
      `The user's reference images (roles and notes they set in the app):\n${describeReferences(req.references, req.hasMarkup)}\nIf a role is just "reference" with no note, infer its likely purpose from the prompt and context; if that stays unclear, write a placeholder like <what to take from image ${n}> instead of guessing.`
    );
  } else {
    parts.push("This is a new GENERATION (no input images unless the prompt says otherwise).");
  }
  if (req.language) {
    parts.push(`The user's brand language is ${req.language}. Write in-image text and captions in that language unless the prompt or context says otherwise; keep the prompt's instructions themselves in English.`);
  }
  parts.push(
    "In-image text in Thai or another non-Latin script must be written exactly in that script inside double quotes. Write the prompt's own instructions in English.",
    "OUTPUT: Return ONLY the final prompt text — no preamble, no explanation, no markdown code fences, no surrounding quotes."
  );
  return parts.join("\n\n");
}

export function assistInput(req: AssistRequest): string {
  const lines: string[] = [];
  lines.push(req.prompt.trim() ? `PROMPT:\n${req.prompt}` : "PROMPT: (empty)");
  lines.push(req.context.trim() ? `USER CONTEXT / IDEA:\n${req.context.trim()}` : "USER CONTEXT / IDEA: (none)");
  return lines.join("\n\n");
}

/** Strips a code fence or wrapping quotes the model may add despite the instructions. */
export function cleanAssistOutput(text: string): string {
  let t = text.trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}
