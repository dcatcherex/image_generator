# Image Studio — GPT Image 2.5 Enhancements (Spec + Implementation Plan)

Handoff doc for a fresh session. Derived from OpenAI's *GPT Image 2.5 prompting guide* (developers.openai.com/api/docs/guides/image-prompting) and a gap analysis of this codebase on 2026-09-30.

**Read first:** `AGENTS.md` (this Next.js version differs from training data — check `node_modules/next/dist/docs/` before writing Next-specific code), `SPEC.md` (architecture, data model, flows), `PLAN.md` "Gotchas" section.

**Ground rules**
- pnpm only. Dev server: `pnpm dev` (usually port 3001).
- Schema changes: edit `src/db/schema.ts`, then `pnpm exec dotenv -e .env.local -- pnpm exec drizzle-kit push`.
- `OPENAI_API_KEY` is a system env var, not in `.env.local` — don't touch it.
- **Real generations cost money.** Verify UI by mocking `window.fetch` in the browser (see PLAN.md task 3). Do at most a handful of real `low`-quality calls, and only where a phase says a real call is needed (e.g. to confirm `usage` shape).
- Run `pnpm lint` and `pnpm build` at the end of every phase. One commit per phase.
- Match surrounding code style: comments explain *why*, shadcn/Base UI components, `Select` pattern already used in `generate-panel.tsx`.

---

## Part 1 — Spec

### Decisions (settled with the user)

| # | Area | Decision |
|---|---|---|
| 1 | Scope | All four themes, implemented in order **C (measurement) → D (params) → B (edit workflow) → A (prompt authoring)**. |
| 2 | Cost | Keep a pre-generation estimate **and** record actual cost from the response `usage`. Estimates self-calibrate from recorded actuals (median per model+quality+size), falling back to the static table. |
| 3 | Resolution | Add a **size tier** picker (1K / 2K / 4K-experimental) that combines with the existing aspect-ratio picker. |
| 4 | Transparency | Disable JPEG while background=transparent (and vice versa); verify alpha server-side and warn if the output is actually opaque; add an `output_compression` slider shown only for JPEG/WebP. |

The following were decided by the assistant using its recommendations (user said "go with all your recommendations"). Revisit only if the user objects:

| # | Area | Decision |
|---|---|---|
| 5 | Prompt assembly | One pure function `buildPrompt()` assembles the final prompt from structured inputs. The DB `prompt` column stores the **final assembled prompt**; a new `prompt_inputs` jsonb stores the raw inputs so the UI can rehydrate them. |
| 6 | Reference roles | Each reference image gets a role dropdown (Subject / Style / Clothing or item / Scene or background / Other) plus optional short note. `buildPrompt()` prepends a numbered "Inputs" section. |
| 7 | Preserve constraints | In edit mode: a "Change only" text field + toggle chips for what to preserve. Emitted as a "Constraints" section. |
| 8 | Refine loop | A "Refine" action on an image loads it as the sole reference, carries forward its preserve constraints, and records `parent_image_id`. The lightbox shows the version chain. |
| 9 | Mask compositing | When a mask is used, composite the edited region back onto the original **server-side with `sharp`**, so unmasked pixels stay byte-identical. On by default, toggleable. |
| 10 | Model comparison | A "Compare models" toggle (instant generate, n=1, not Economy) runs Flare and Sunburst in parallel with identical params; results share a `compare_group_id` and open in a side-by-side dialog showing duration and actual cost. |
| 11 | Presets | Client-side preset library from the guide's examples. Picking one inserts a labelled-section scaffold into the prompt textarea and applies recommended params. No separate "structured editor" — the plain textarea stays the single source of truth. |
| 12 | Exact text | An "Exact text" input; when filled, `buildPrompt()` appends a verbatim-text instruction ("exactly once, no extra text, no watermarks"). |
| 13 | Out of scope | Edit `n > 1`, Economy mode for edits, LLM-based prompt rewriting, automatic QA of text accuracy. |

### Data model changes (`images` table)

All nullable, so existing rows stay valid:

| Column | Type | Purpose |
|---|---|---|
| `actual_cost` | numeric(10,4) | USD computed from `usage` |
| `input_tokens` | integer | `usage.input_tokens` |
| `input_image_tokens` | integer | `usage.input_tokens_details.image_tokens` |
| `output_tokens` | integer | `usage.output_tokens` |
| `duration_ms` | integer | Server-measured time from OpenAI request start to final image bytes (excludes Blob upload/DB insert) |
| `output_compression` | integer | 0–100, JPEG/WebP only |
| `transparency_ok` | boolean | Only set when background=transparent: true if decoded image has any non-opaque pixel |
| `parent_image_id` | uuid | Refine chain (not a FK constraint — deleting a parent must not cascade) |
| `prompt_inputs` | jsonb | `PromptInputs` (see below) |
| `reference_roles` | jsonb | `Array<{ role: ReferenceRole; note?: string }>`, aligned with `reference_image_ids` / upload order |
| `compare_group_id` | uuid | Shared by the two images of a model comparison |

`BatchRequestMeta` (`src/lib/batch.ts`) gains `compression: number | null` and `promptInputs: PromptInputs | null`. Batch ingestion (`src/lib/batch-poll.ts`) should record `usage` if present in each output line's `response.body.usage` and apply the 50% discount to `actual_cost`.

`ImageRecord` (`src/lib/types.ts`) gets matching camelCase fields. There are currently multiple row→record mappings (`save-image.ts`, `/api/images`, maybe others — grep for `blobPathname:`); consolidate them into one `rowToImageRecord()` in `src/lib/image-record.ts` as part of Phase 0.

### Shared types (new `src/lib/prompt-builder.ts`)

```ts
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

export type PromptInputs = {
  base: string;                         // what the user typed
  exactText?: string;                   // Phase A2
  changeOnly?: string;                  // Phase B2 (edit only)
  preserve?: PreserveId[];              // Phase B2 (edit only)
  referenceRoles?: Array<{ role: ReferenceRole; note?: string }>; // Phase B1 (edit only)
};

export function buildPrompt(inputs: PromptInputs): string;
```

`buildPrompt()` output shape (sections omitted when empty; plain `base` returned unchanged if nothing else is set, so existing behavior is preserved):

```
Inputs:
- Image 1: subject — <note>
- Image 2: style reference — use only its palette, texture and medium

<base>

Change only: <changeOnly>

Constraints:
- Preserve exactly: <joined preserve texts>.
- Do not add text, logos or watermarks unless requested.

Text (render verbatim, exactly once, clearly legible; no other text):
"<exactText>"
```

Role wording for the Inputs lines: subject → "subject to preserve", style → "style reference — use only its palette, texture and visual medium", item → "item to apply", scene → "scene/background to place things into", other → "reference". Unit-testable pure function; keep all wording in this file.

**Server is authoritative**: API routes receive `promptInputs` (JSON), call `buildPrompt()`, and send/store the result. Keep accepting plain `prompt` for backward compatibility (treated as `{ base: prompt }`).

### Size tiers

Replace the single `TARGET_PIXEL_AREA` in `src/lib/openai.ts` with tiers:

| Tier | Target area | Notes |
|---|---|---|
| `1K` | 1536×1024 = 1,572,864 | current behavior, default |
| `2K` | 2560×1440 = 3,686,400 | largest non-experimental area |
| `4K` | 3840×2160 = 8,294,400 | label "4K (experimental)" |

`sizeFromAspectRatio(w, h, tier)` must guarantee the guide's constraints: both edges multiples of 16 (**floor**, not round, so area never exceeds the max), each edge ≤ 3840, long:short ≤ 3:1, area within [655,360, 8,294,400]. If the long edge exceeds 3840, clamp it to 3840 and derive the other edge. Add a `validateSize()` helper enforcing the same rules and use it server-side in `/api/generate`, `/api/edit`, `/api/batch/generate` (reject with 400). When aspect ratio = Auto, size is `"auto"` and the tier picker is disabled.

### Cost

- `src/lib/pricing.ts`: add `actualCostFromUsage(usage, { batch?: boolean })` using OpenAI's published GPT Image 2.5 token prices (already quoted in that file's header comment): $8/M image input, $5/M text input (text tokens = `input_tokens - image_tokens`), $30/M image output. Ignore cached-token discounts (not exposed per request). Halve when `batch`.
- `estimateCost()` fallback: extend beyond the three 1K sizes by scaling the nearest 1K entry by pixel area (currently unknown sizes silently fall back to the 1024×1024 price, which is wrong for 2K/4K).
- Calibration: new `GET /api/cost-stats` returns `{ [key: "model|quality|size"]: { median: number, count: number } }` over rows where both `actual_cost` and `duration_ms` are not null. Batch rows never get a `duration_ms`, so this excludes their 50%-discounted costs from instant-mode estimates. The panel fetches it once on mount; if `count >= 3` for the current key, show that median instead of the table value. Show "~" before table-based values and no "~" before calibrated ones.
- Card/lightbox: show actual cost (฿) when present, else the estimate with "~". Lightbox also shows duration ("12.4s") and tokens in a small metadata line.

### Transparency & compression

- In the panel: when `background === "transparent"`, the JPEG `SelectItem` is `disabled`; if JPEG was selected when transparent is chosen, switch to PNG with a toast. Mirror: when format is JPEG, Transparent is disabled.
- Server: reject transparent+jpeg with 400 in all three routes.
- Compression slider (0–100) visible only for JPEG/WebP. Default is unset (`null` = API default); only send `output_compression` once the user has moved the slider, and never for PNG. Stored in `output_compression`.
- Alpha check: add `sharp` as a dependency. In `persistGeneratedImage()`, when `background === "transparent"`, run `sharp(buffer).stats()` and set `transparency_ok = !stats.isOpaque`. When false, the "done" event / edit response carries `warning: "Transparent background requested but the image is fully opaque"` and the client shows a warning toast. Card shows a small warning badge.

### Model comparison

- Panel toggle "Compare models" (hidden in edit mode, Economy mode, and when n>1; hide the Model select while it's on).
- Client fires two `/api/generate` requests in parallel with the same payload, differing only in `model`, plus a shared client-generated `compareGroupId`. `useImageStream` currently holds a single stream's state — add a second instance in `home.tsx` rather than generalizing the hook.
- When both are done, open a `CompareDialog` (new `src/components/compare-dialog.tsx`): two images side by side, each labelled with model, duration, actual cost; buttons "Keep both" (close), "Keep Flare"/"Keep Sunburst" (deletes the other via existing `DELETE /api/images/[id]`).

### Edit workflow

- **Reference roles** (`reference-images-picker.tsx`): each thumbnail gets a compact role `Select` + optional note input (popover). Default role: first image = subject, others = other. Numbering in the UI ("1", "2", …) must match upload order sent to the API. Hidden when there's only one reference image and no note (keep single-image edits frictionless), but still send `subject` for it.
- **Change only / Preserve** (edit mode only, below the prompt): an input "Change only…" and a wrapping row of toggle chips from `PRESERVE_OPTIONS`. Default selection: none. Sticky within a refine chain (see below).
- **Refine**: new action on image card and lightbox (icon `Wand2` or similar, tooltip "Refine"). It replaces current references with this image, pre-fills preserve chips/changeOnly from the image's `prompt_inputs` (if it was an edit), clears the prompt, focuses the textarea, and sets a `parentImageId` sent to `/api/edit`. This differs from existing "Use as reference" which appends and sets no parent.
- **Version chain**: lightbox shows a small "Versions" strip when the image has a parent or children: walk `parent_image_id` up to the root and collect descendants of the root (client-side from the loaded `images` array — no new endpoint needed; the gallery already loads all images). Clicking a version navigates the lightbox.
- **Mask compositing** (`/api/edit`): when a mask is present and `compositeMask` form field is not `"false"`: decode original, mask and result with `sharp`; resize the result to the original's dimensions; take pixels from the result where the mask is transparent (OpenAI mask convention: transparent = area to edit — **verify against `mask-editor.tsx`'s output before implementing**) and from the original elsewhere; feather the mask edge by ~2px to avoid seams. Store the composite (not the raw result). Panel shows a checkbox "Keep unmasked area pixel-identical" next to the existing mask controls, default on.

### Prompt authoring

- **Presets** (`src/lib/prompt-presets.ts`): array of `{ id, label, mode: "generate" | "edit", scaffold: string, params?: Partial<{ aspect: string; tier: SizeTier; quality: string; background: string; format: string }>, preserve?: PreserveId[] }`. Scaffolds use the guide's labelled-section style with `<placeholders>`. Initial set (adapt from the guide's example prompts):
  - Generate: Candid photo, Infographic / process, Ad with tagline, Logo (transparent, png), Comic strip (4 panels, 2:3), App UI mockup, Classroom diagram (high, 3:2), Pitch slide (high, 16:9), Character sheet, Holiday card, Product/merch shot.
  - Edit: Product cutout (transparent, png, preserve product), Style transfer, Change clothing (preserve identity+pose+background+camera), Combine references, Remove object (preserve everything else), Sketch → photo (preserve layout+camera), Translate text (high, preserve layout), Swap furniture/object (preserve camera+lighting).
- Panel: a "Presets" dropdown above the prompt, filtered by current mode. Picking one: if the textarea is non-empty, confirm via a small inline "Replace prompt?" choice (no `window.confirm` — use a Popover/Dialog); then insert scaffold, apply params and preserve chips, toast "Applied preset: <label> (quality high, 16:9)".
- **Exact text**: collapsible "Exact text" input under the prompt (both modes). When set and quality is `low`, show a hint "Small text renders better at medium or higher".
- Add new panel sections to `PANEL_OPTIONS` in `use-panel-options.ts` so they can be hidden in Settings: `tier`, `compression`, `compare`, `presets`, `exactText`, `preserve`.

---

## Part 2 — Implementation plan

Each phase is independently shippable. Do them in order; later phases assume earlier ones.

### Phase 0 — Foundations
1. Add all new `images` columns to `src/db/schema.ts` (single migration, all nullable) and run `drizzle-kit push`.
2. Create `src/lib/image-record.ts` with `rowToImageRecord()`; replace every hand-written mapping (grep `blobPathname:` across `src/`).
3. Extend `ImageRecord` and `BatchRequestMeta` types.
4. Extend `persistGeneratedImage()` params with the new optional fields and write them.

**Accept:** build passes, existing gallery renders unchanged, new columns exist and are null for old rows.

### Phase 1 — Actual cost + latency (C1)
1. `pricing.ts`: `actualCostFromUsage()`.
2. `/api/generate`: record `t0` before the OpenAI call; streaming path — capture `usage` from the completed event (`ImageGenCompletedEvent.usage`) and stop the clock on it; non-streaming path — `response.usage` and stop the clock when the call resolves. For n>1, split tokens and cost evenly across images and give each the same duration.
3. `/api/edit`: same, from `result.usage`.
4. Batch ingestion (`batch-poll.ts`): read `response.body.usage` if present, `batch: true`, `duration_ms` null.
5. Card + lightbox cost/duration display.
6. Do **one** real `low` 1K generation to confirm `usage` is present for `gpt-image-2.5-*` (SDK types say "gpt-image-1 only" on `ImagesResponse.usage`; the streaming event types say "GPT image models"). If absent, keep columns null and fall back gracefully — never crash.

**Accept:** a new image shows actual ฿ cost and duration; old images still show the estimate.

### Phase 2 — Calibrated estimates (C2)
1. `GET /api/cost-stats` (auth-gated with `requireUser()` like other routes), median via SQL `percentile_cont(0.5)` grouped by model, quality, size where `actual_cost` and `duration_ms` are not null.
2. Pixel-area scaling fallback in `estimateCost()`.
3. Panel uses stats when `count >= 3`; "~" prefix only for table values. Refetch stats after each completed generation.

**Accept:** with ≥3 real rows for a combo, the badge shows their median.

### Phase 3 — Size tiers (D1)
1. `SIZE_TIERS`, new `sizeFromAspectRatio(w, h, tier)`, `validateSize()` in `src/lib/openai.ts`. Write a quick table check (a throwaway script in the scratchpad, not committed) printing every aspect × tier and asserting the constraints.
2. Panel: tier `Select` next to Size; label shows computed size; disabled when aspect = Auto.
3. Server-side `validateSize()` in all three generation routes.

**Accept:** every aspect × tier combination produces a valid size; 21:9 @ 4K clamps to a 3840-wide size.

### Phase 4 — Transparency guard, compression, alpha check (D2)
1. `pnpm add sharp`; confirm it builds on Vercel (Node runtime, not edge).
2. Panel mutual-disable logic + compression slider (shadcn `Slider` exists at `src/components/ui/slider.tsx`).
3. Pass `output_compression` through `/api/generate`, `/api/edit`, `buildBatchJsonl()`.
4. Server 400 for transparent+jpeg.
5. Alpha check in `persistGeneratedImage()`; propagate `warning` on the SSE `done` event type (`DoneImageEvent.warning?: string`) and the edit JSON response; warning toast + card badge.

**Accept:** can't pick JPEG with transparent; compression is only sent for JPEG/WebP; a mocked opaque "transparent" result shows the warning.

### Phase 5 — Model comparison (C3)
1. Panel toggle + `compareGroupId` in the generate payload → stored.
2. `home.tsx`: second `useImageStream()` instance; run both; both previews visible in the gallery's pending area.
3. `CompareDialog` with keep/delete actions.

**Accept:** one click produces two images (one per model) with durations and costs side by side; "Keep Flare" deletes the Sunburst image and its blob.

### Phase 6 — Prompt builder + reference roles (B1)
1. `src/lib/prompt-builder.ts` with `buildPrompt()` + types. Add a minimal test (there is no test runner yet — if adding one is out of scope, write a scratchpad script with `node --experimental-strip-types` asserting a few outputs, and note it in the commit message).
2. Routes accept `promptInputs` (JSON string in the edit form data), build the prompt, store both.
3. Reference picker role UI; `ReferenceItem` gains `role` and `note`.
4. "Use as prompt" should restore `prompt_inputs.base` (not the assembled prompt) when available, plus exact text/preserve.

**Accept:** a two-image edit sends a prompt that starts with the numbered Inputs section; the stored `prompt` is the assembled text.

### Phase 7 — Change-only & preserve constraints (B2)
1. Edit-mode UI (input + chips) → `promptInputs.changeOnly/preserve`.
2. Wording lives only in `prompt-builder.ts`.

**Accept:** selecting Identity + Lighting and typing "the jacket" yields the Change only and Constraints sections.

### Phase 8 — Refine loop + versions (B3)
1. `onRefine(image)` in `home.tsx`, wired into card and lightbox.
2. `parentImageId` through `/api/edit` → `parent_image_id`.
3. Versions strip in the lightbox.

**Accept:** refine an image twice; lightbox on any of the three shows all three versions in order; preserve chips carried forward.

### Phase 9 — Mask compositing (B4)
1. Verify the mask alpha convention in `mask-editor.tsx`.
2. Implement composite in `/api/edit` with `sharp` (resize result to original dims, feathered mask, composite). Ensure the original's format/alpha is handled (convert all three to RGBA first).
3. Checkbox in the panel, default on.

**Accept:** with a mocked result image that's solid red, the stored output is red only inside the painted area and byte-identical to the original elsewhere (compare pixels in a scratchpad script).

### Phase 10 — Presets (A1)
1. `src/lib/prompt-presets.ts` with the list above.
2. Presets dropdown + replace-confirmation popover; apply params (size tier/aspect/quality/background/format) and preserve chips.

**Accept:** "Logo" sets transparent + PNG and inserts the scaffold; switching to edit mode shows only edit presets.

### Phase 11 — Exact text (A2)
1. Input + low-quality hint; flows through `promptInputs.exactText`.

**Accept:** stored prompt ends with the verbatim-text section; "Use as prompt" restores the field.

### Phase 12 — Docs
Update `SPEC.md` (data model table, flows, scope list), add a line in `PLAN.md` marking this work done, and remove stale comments in `pricing.ts` that no longer apply.

---

## Open risks / verify during implementation
- **`usage` presence for 2.5 models** and in batch output lines — confirm with one real call; handle null.
- **Mask alpha convention** — confirm before Phase 9.
- **`sharp` on Vercel with pnpm** — confirm the production build includes the native binary (check the deployment after Phase 4 is pushed).
- **4K generation time** — `maxDuration = 300` on the routes; a 4K `max`-quality request could approach it. If it times out in testing, show a hint recommending Economy mode for 4K rather than raising limits.
- **Response size** — 4K PNG base64 in the SSE stream can be large; partial frames are already streamed, but the edit route returns JSON. The 4.5 MB Vercel response limit applies to responses: the edit route returns only the `ImageRecord` (URL), not bytes, so it's fine; double-check the SSE `partial` events for 4K don't exceed limits (if they do, drop `partial_images` for 4K).
