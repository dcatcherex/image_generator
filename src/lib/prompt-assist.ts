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
  referenceCount: number;
};

export function assistInstructions(req: AssistRequest): string {
  const sticker = /sticker|line messenger/i.test(req.prompt) || /sticker/i.test(req.context);
  const parts = [GUIDE];
  if (sticker) parts.push(STICKER_TIPS);
  parts.push(MODE_TASKS[req.mode]);
  parts.push(
    req.isEdit
      ? `This is an EDIT request with ${req.referenceCount} input image(s): refer to them as "the reference image" / "image 1, image 2" and keep edit-style wording (change only / preserve).`
      : "This is a new GENERATION (no input images unless the prompt says otherwise)."
  );
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
