import type { SizeTier } from "./openai";
import type { PreserveId } from "./prompt-builder";

// Client-side preset library adapted from the examples in OpenAI's GPT Image 2.5 prompting
// guide. A preset only fills the plain prompt textarea with a labelled-section scaffold (edit
// the <placeholders>) and sets recommended params, so the textarea stays the single source
// of truth. Edit presets leave reference roles and constraints to buildPrompt(): the
// scaffold is just the `base`.

export type PresetParams = Partial<{
  aspect: string; // an ASPECT_RATIOS label, e.g. "16:9"
  tier: SizeTier;
  quality: string;
  background: string;
  format: string;
}>;

export type PromptPreset = {
  id: string;
  label: string;
  mode: "generate" | "edit";
  scaffold: string;
  params?: PresetParams;
  preserve?: PreserveId[];
};

const ALL_PRESERVE: PreserveId[] = [
  "identity",
  "pose",
  "product",
  "layout",
  "lighting",
  "camera",
  "background",
  "text",
];

export const PROMPT_PRESETS: PromptPreset[] = [
  // ---- Generate ----
  {
    id: "candid-photo",
    label: "Candid photo",
    mode: "generate",
    scaffold: `Scene: <where and when, e.g. a busy street market at golden hour>
Subject: <who or what, with one or two concrete details>
Camera: candid photo, 35mm lens, natural framing, slight motion, shallow depth of field
Lighting: <natural light direction and quality>
Constraints: photorealistic skin and textures, no text, no watermarks`,
    params: { quality: "high" },
  },
  {
    id: "infographic",
    label: "Infographic / process",
    mode: "generate",
    scaffold: `Type: clean infographic explaining <process or concept>
Layout: <number> numbered steps flowing left to right, one icon per step
Steps:
1. <step title> — <short caption>
2. <step title> — <short caption>
3. <step title> — <short caption>
Style: flat vector, consistent icon set, <palette>, plenty of white space
Text: all labels exactly as written above, no extra text`,
    params: { quality: "high", aspect: "16:9" },
  },
  {
    id: "ad-tagline",
    label: "Ad with tagline",
    mode: "generate",
    scaffold: `Type: advertisement for <product or brand>
Hero: <the product, how it is shown, and the scene around it>
Tagline: "<tagline text>" placed <position>, large, high-contrast, clearly legible
Mood: <feeling, e.g. fresh, premium, playful>
Style: <photographic or illustrated>, <palette>
Constraints: tagline exactly once, no other text, no logos unless described`,
    params: { quality: "high", aspect: "4:5" },
  },
  {
    id: "logo",
    label: "Logo",
    mode: "generate",
    scaffold: `Type: logo mark for <brand name>, <industry>
Concept: <symbol or idea>, simple geometric shapes, works at small sizes
Style: flat vector, <one or two colors>, no gradients, no shadows
Text: "<brand name>" wordmark beneath the symbol, in <font style>
Constraints: centered, generous padding, transparent background`,
    params: { background: "transparent", format: "png", aspect: "1:1", quality: "high" },
  },
  {
    id: "comic-strip",
    label: "Comic strip (4 panels)",
    mode: "generate",
    scaffold: `Type: 4-panel comic strip, 2x2 grid, thin gutters
Characters: <name: short visual description>
Panel 1: <what happens>. Caption: "<text>"
Panel 2: <what happens>. Caption: "<text>"
Panel 3: <what happens>. Caption: "<text>"
Panel 4: <what happens>. Caption: "<text>"
Style: <art style>, consistent character design across panels
Constraints: captions exactly as written, no extra text`,
    params: { aspect: "2:3", quality: "high" },
  },
  {
    id: "app-ui",
    label: "App UI mockup",
    mode: "generate",
    scaffold: `Type: mobile app screen mockup, <screen name>
Layout: <top bar>, <main content blocks>, <bottom navigation>
Content: <list the real labels, numbers and button text>
Style: modern, clean, <light or dark> theme, <accent color>, rounded cards, consistent spacing
Constraints: legible UI text exactly as listed, realistic proportions`,
    params: { aspect: "9:16", quality: "high" },
  },
  {
    id: "classroom-diagram",
    label: "Classroom diagram",
    mode: "generate",
    scaffold: `Type: labelled teaching diagram of <topic>, for <age group>
Layout: <main object> in the center, labels with leader lines around it
Labels: <label 1>, <label 2>, <label 3>, <label 4>
Style: clear textbook illustration, bold outlines, soft flat colors, white background
Constraints: every label spelled exactly as written, one label per part, no extra text`,
    params: { quality: "high", aspect: "3:2" },
  },
  {
    id: "pitch-slide",
    label: "Pitch slide",
    mode: "generate",
    scaffold: `Type: presentation slide, 16:9
Title: "<slide title>"
Body: <3 short bullets or one key figure, written out exactly>
Visual: <supporting chart, icon or photo and where it sits>
Style: <brand feel>, <palette>, strong hierarchy, lots of margin
Constraints: text exactly as written, high contrast, no extra text`,
    params: { quality: "high", aspect: "16:9" },
  },
  {
    id: "character-sheet",
    label: "Character sheet",
    mode: "generate",
    scaffold: `Type: character design sheet for <character name>
Character: <age, build, outfit, signature features>
Views: front, side and back full-body turnarounds, plus 3 face expressions
Style: <art style>, neutral pose, plain light background, consistent proportions across views
Constraints: same character in every view, labels only if written here`,
    params: { aspect: "3:2", quality: "high" },
  },
  {
    id: "holiday-card",
    label: "Holiday card",
    mode: "generate",
    scaffold: `Type: <holiday> greeting card, front side
Scene: <festive illustration>
Greeting: "<message>" in <lettering style>, centered at the <top/bottom>
Style: <warm/cozy/modern>, <palette>, soft texture
Constraints: greeting spelled exactly as written, appears once, no other text`,
    params: { aspect: "4:5", quality: "high" },
  },
  {
    id: "product-shot",
    label: "Product / merch shot",
    mode: "generate",
    scaffold: `Type: studio product photo of <product>
Product: <shape, material, color, and any label text exactly as printed>
Setting: <seamless backdrop color or simple prop surface>
Camera: <three-quarter angle>, 85mm, sharp focus, soft shadow
Lighting: softbox key light, gentle rim light, clean reflections
Constraints: accurate product proportions, no extra logos or text`,
    params: { aspect: "4:5", quality: "high" },
  },

  // ---- Edit ----
  {
    id: "product-cutout",
    label: "Product cutout",
    mode: "edit",
    scaffold: `Cut out the product from the photo and place it on a fully transparent background.
Keep clean, smooth edges and remove all shadows and surrounding objects.`,
    params: { background: "transparent", format: "png", quality: "high" },
    preserve: ["product"],
  },
  {
    id: "style-transfer",
    label: "Style transfer",
    mode: "edit",
    scaffold: `Redraw the subject image in the style of the style reference: <style, medium, e.g. watercolor illustration>.
Keep the subject's shapes and composition; take only palette, texture and brushwork from the style reference.`,
    params: { quality: "high" },
    preserve: ["layout", "camera"],
  },
  {
    id: "change-clothing",
    label: "Change clothing",
    mode: "edit",
    scaffold: `Change the person's <garment> to <new garment: color, material, fit>.
Match the original lighting and fabric folds naturally.`,
    params: { quality: "high" },
    preserve: ["identity", "pose", "background", "camera"],
  },
  {
    id: "combine-references",
    label: "Combine references",
    mode: "edit",
    scaffold: `Combine the reference images into one coherent scene: <describe the final scene and where each element goes>.
Unify lighting, scale and perspective so it looks like a single photograph.`,
    params: { quality: "high" },
  },
  {
    id: "remove-object",
    label: "Remove object",
    mode: "edit",
    scaffold: `Remove <object> from the image and fill the area naturally so it looks like it was never there.`,
    params: { quality: "high" },
    preserve: ALL_PRESERVE,
  },
  {
    id: "sketch-to-photo",
    label: "Sketch → photo",
    mode: "edit",
    scaffold: `Turn this sketch into a photorealistic image of <what it depicts>.
Materials: <materials and colors>. Lighting: <light setup>.`,
    params: { quality: "high" },
    preserve: ["layout", "camera"],
  },
  {
    id: "translate-text",
    label: "Translate text",
    mode: "edit",
    scaffold: `Translate all text in the image into <language>, matching the original font style, size, color and placement.
Translations exactly: "<original>" -> "<translation>"`,
    params: { quality: "high" },
    preserve: ["layout"],
  },
  {
    id: "swap-object",
    label: "Swap furniture / object",
    mode: "edit",
    scaffold: `Replace the <object> with <new object: style, material, color>.
Match its scale, perspective, reflections and shadows to the scene.`,
    params: { quality: "high" },
    preserve: ["camera", "lighting"],
  },
];
