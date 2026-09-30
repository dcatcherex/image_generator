// Prompt assembly types shared by the DB schema, routes and UI. `buildPrompt()` itself lands
// in a later phase (ENHANCEMENTS.md Phase 6); only the types live here for now.

export type ReferenceRole = "subject" | "style" | "item" | "scene" | "other";

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

export type PromptInputs = {
  base: string; // what the user typed
  exactText?: string;
  changeOnly?: string; // edit only
  preserve?: PreserveId[]; // edit only
  referenceRoles?: Array<{ role: ReferenceRole; note?: string }>; // edit only
};
