# REFACTOR.md — deepen six modules

An implementation plan for a coding agent. It turns six shallow areas of this app into deep
modules: a lot of behaviour behind a small interface, testable through that interface. Work the
phases in order; each one leaves the app working.

Line numbers are hints as of commit `4a4ca82` plus the uncommitted reference-image work. Function
and constant names are the reliable anchor: search for the name when a line number is off.

## Ground rules

- **Behaviour is preserved.** The only intended behaviour changes are the ones in
  [Intended behaviour changes](#intended-behaviour-changes). Every user-facing string (error
  messages, toasts) stays byte-identical unless that list says otherwise.
- **Start state.** `git status` may show uncommitted edits in `src/components/home.tsx`,
  `src/components/reference-images-picker.tsx` and `src/lib/reference-items.ts`. They are the
  user's work in progress (reference de-duplication). Build on top of them. Commit only when the
  user has asked you to; if they have, use one commit per phase.
- **Next.js.** `AGENTS.md` applies: this Next version differs from your training data. Read the
  relevant guide under `node_modules/next/dist/docs/` before changing a route handler or anything
  with `"use client"`.
- **Real money.** `/api/generate`, `/api/edit` and `/api/batch/generate` spend OpenAI credits.
  Verify with tests, type-checking and the build. Leave live generations to the user and list
  them in your hand-off (see [Hand-off](#hand-off)).
- **No schema changes.** Nothing here touches `src/db/schema.ts` or needs a migration.
- **Package manager** is pnpm.
- **Pure modules stay pure.** `image-params.ts`, `generation-request.ts`, `edit-form.ts`,
  `reference-set.ts`, `composer-draft.ts` and `image-actions.ts` import no React, no `@/db`, no
  `openai` SDK and no `sonner`. The client bundle and the tests both load them.

### Phase gate

A phase is done when all four pass and its own completion criterion holds:

```
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

`pnpm build` reads `.env.local`. If it fails for a reason unrelated to your change, report the
output and continue with the other three.

## Intended behaviour changes

1. **Stored cost estimate includes input images.** `persistGeneratedImage` calls `estimateCost`
   without `inputImages`, so `cost_estimate` for edits and logo generations is lower than the
   figure the panel shows. After Phase 2 both use the same field list.
2. **Batch stores normalised `complexity`.** `batch/generate/route.ts` stores the raw string;
   the other two routes store what `complexityParam` returns. After Phase 2 batch stores the
   normalised value. `buildBatchJsonl` and batch ingest keep calling `complexityParam`, because
   jobs already stored in `batch_jobs.requests` hold the raw value.
3. **Favorite failures show a toast.** Today a failed favorite is silent while a failed tag
   toasts. After Phase 3 every image action reports failure the same way.
4. **`PATCH /api/images/[id]` validates `tag`.** A tag outside `ASSIGNABLE_TAGS` returns
   `400 { error: "Unknown tag" }`. `null` or `""` still clears it.
5. **Malformed `referenceImageIds` no longer throws.** The edit route `JSON.parse`s the field
   unguarded. After Phase 2, unparseable or non-array input becomes `[]` and non-UUID entries are
   dropped.
6. **One reference identity rule.** After Phase 4 a reference is identified by its gallery image
   id, or for uploads by `name|size|lastModified`, everywhere.
7. **Empty-string settings take the default on `/api/generate`.** The JSON route defaults only
   `undefined`; the form and batch routes default any falsy value. After Phase 2 all three treat
   `undefined`, `null` and `""` as "use the default".

Simultaneous validation errors may surface in a different order than today (for example a bad
size and a bad format in one request). Each individual message is unchanged.

**Deliberately unchanged:** `model` and `quality` stay unvalidated on the server; no optimistic
updates are added; blob preview URLs are still never revoked.

---

## Phase 0 — test runner

The repo has no tests and no runner.

1. `pnpm add -D vitest`.
2. Add `vitest.config.ts` at the repo root: `environment: "node"`, `include:
   ["src/**/*.test.ts"]`, and a `resolve.alias` mapping `@` to `./src` (mirrors `paths` in
   `tsconfig.json`).
3. Add `"test": "vitest run"` to `package.json` scripts.
4. Add one characterisation test file per existing pure module you are about to move code out
   of, so the moves in Phase 1 are covered: `src/lib/openai.test.ts` covering `validateSize`
   (each error branch plus `"auto"`), `sizeFromAspectRatio` (one ratio per tier, and the 3840
   clamp with `21:9` at `4K`), `normalizeCompression`, `normalizeGif`, `complexityParam`,
   `unsafeSvgReason`; `src/lib/pricing.test.ts` covering `estimateCost` (exact table row,
   nearest-size fallback, `"auto"`, `frames > 1`, `inputImages`), `costStatsKey`,
   `estimateCostCalibrated` (below and at `CALIBRATION_MIN_COUNT`), `usageToFields` (`count`
   split, `batch`), `actualSizeOr`.

**Done when:** the phase gate passes and every function named in step 4 has at least one
assertion per branch listed.

---

## Phase 1 — image parameters module

`src/lib/openai.ts` mixes the server-only SDK client with pure size, model and format rules that
client components import. Seven files parse the `WIDTHxHEIGHT` string with their own copy of
`/^(\d+)x(\d+)$/`.

### Create `src/lib/image-params.ts`

Move every export of `openai.ts` into it **except** `getOpenAI` and `svgParams` (both read
`process.env`; they stay). Then add:

```ts
/** "1536x1024" -> { width: 1536, height: 1024 }; null for "auto" or anything else. */
export function parseSize(size: unknown): { width: number; height: number } | null;

/** The size an image came back at, when the response reports WxH; else the requested size. */
export function actualSizeOr(requested: string, reported: unknown): string; // moved from pricing.ts

/** Streamed partial frames requested when live preview is on. */
export const PREVIEW_PARTIALS = 2;

/** Largest per-request image count (matches N_OPTIONS). */
export const MAX_COUNT = 4;
export function clampCount(n: unknown): number; // Math.min(Math.max(Number(n) || 1, 1), MAX_COUNT)

/** What an output format allows, independent of model or endpoint. */
export function formatTraits(format: string): {
  singleImage: boolean;      // svg, gif: n is forced to 1
  takesCompression: boolean; // jpeg, webp only
  takesBackground: boolean;  // false for svg
  streams: boolean;          // false for svg, gif
};

export type RequestMode = "generate" | "edit" | "batch";

/** Null when `format` is allowed, else the message the server returns. */
export function formatUnavailableReason(
  format: string,
  ctx: { model: string; mode: RequestMode; hasMask?: boolean }
): string | null;
```

`formatUnavailableReason` rules, checked in this order, messages verbatim:

| Format | Condition | Message |
|---|---|---|
| svg | `mode === "edit"` | `SVG output is only available for new generations, not edits` |
| svg | `mode === "batch"` | `SVG output isn't available in Economy mode` |
| svg | `!supportsSvg(model)` | `SVG output needs a GPT Image 2.6 model` |
| gif | `mode === "batch"` | `GIF output isn't available in Economy mode` |
| gif | `!supportsGif(model)` | `GIF output needs a GPT Image 2.6 model` |
| gif | `hasMask` | `GIF output can't be used with a mask` |

### Rewire

- Update every importer of the moved names to import from `@/lib/image-params`. Leave no
  re-exports in `openai.ts`; after this phase it exports only `getOpenAI` and `svgParams`.
- Replace each private size regex with `parseSize`: `validateSize`, `parseWxH` in `pricing.ts`,
  `SIZE_PATTERN` in `masonry.ts`, `looksLikeRichMenu` in `line-rich-menu.ts`, the local
  `parseSize` in `image-card.tsx`, `dims` in `line-rich-menu-dialog.tsx`, and `applyPreset` in
  `generate-panel.tsx`.
- Delete the three `PREVIEW_PARTIALS = 2` copies (`generate/route.ts`, `generate-panel.tsx`,
  `help-dialog.tsx`) and import the shared one.
- Replace both inline `n` clamps (`generate/route.ts`, `batch/generate/route.ts`) with
  `clampCount`.
- Replace the inline UUID regexes in `generate/route.ts` and `edit/route.ts` with `isUuid` from
  `@/lib/brands`. `prompt-builder.ts` keeps its own copy (importing `brands.ts` there would
  create an import cycle risk; leave it).
- Rename `openai.test.ts` to `image-params.test.ts` and add cases for `parseSize`, `clampCount`,
  `formatTraits` (png, jpeg, webp, svg, gif) and every row of the table above.

**Done when:** the phase gate passes; `grep -rn "d+)x(" src` matches only inside
`image-params.ts`; `grep -rn "PREVIEW_PARTIALS = " src` matches once; no file under
`src/components` imports `@/lib/openai`.

---

## Phase 2 — generation request module

The generate, edit and batch routes each decode the same request by hand and then run the same
sanitise / validate / build-prompt sequence. The helpers are shared; their composition is
copy-pasted and has drifted. The ~20-field argument block for `persistGeneratedImage` is written
four times (twice in the generate route, once in edit, once in `batch-poll.ts`).

### Create `src/lib/edit-form.ts`

The single place that knows the `/api/edit` FormData field names. Used by the client to encode
and the server to decode.

```ts
export type EditFormFields = {
  promptInputs: PromptInputs;          // JSON
  size: string; quality: string; format: string; background: string; model: string;
  compression?: number | null;
  complexity?: string;
  frameCount?: number; frameDurationMs?: number;   // sent only for gif
  referenceImageIds: string[];         // JSON
  images: File[];                      // appended as repeated "images"
  markup?: File | null;
  mask?: File | null;
  compositeMask?: boolean;             // sent as "false" only when false and a mask is present
  parentImageId?: string | null;
  brand?: BrandRequest | null;         // JSON
  tag?: string | null;
};

export function encodeEditForm(fields: EditFormFields): FormData;

export type DecodedEditForm = {
  raw: RawGenerationInput;             // see generation-request.ts
  brand: unknown;                      // parsed JSON, unsanitised
  images: File[];
  mask: File | null;
  markup: File | null;
  compositeMask: boolean;              // true unless the field is exactly "false"
};

export function decodeEditForm(
  form: FormData
): { ok: true; value: DecodedEditForm } | { ok: false; error: string };
```

`decodeEditForm` errors, verbatim: `promptInputs must be valid JSON`, `brand must be valid JSON`.
Field presence must match what `handleSubmit` in `generate-panel.tsx` sends today (optional
fields are omitted, not sent empty).

### Create `src/lib/generation-request.ts`

```ts
export type RawGenerationInput = {
  prompt?: unknown; promptInputs?: unknown;
  size?: unknown; quality?: unknown; format?: unknown; background?: unknown; model?: unknown;
  n?: unknown; tag?: unknown; preview?: unknown; compression?: unknown; complexity?: unknown;
  frameCount?: unknown; frameDurationMs?: unknown;
  compareGroupId?: unknown;            // generate only
  parentImageId?: unknown;             // edit only
  referenceImageIds?: unknown;         // edit only: array, or a JSON string of one
};

export type Attachments = {
  imageCount: number;                              // user reference files, logo excluded
  hasMask: boolean;
  markup: { type: string; size: number } | null;
};

export type GenerationRequest = {
  mode: RequestMode;
  prompt: string;                      // final assembled prompt
  promptInputs: PromptInputs | null;   // what is stored; null for a plain-string prompt
  model: string; size: string; quality: string; format: string;
  background: string;                  // what the user asked for
  storedBackground: string;            // "auto" for svg, else `background`
  count: number;                       // 1 for edit, svg and gif
  compression: number | null;
  complexity: Complexity | null;
  gif: GifSettings | null;
  streams: boolean;                    // generate && count === 1 && formatTraits(format).streams
  partials: number;                    // PREVIEW_PARTIALS when streams && preview, else 0
  tag: string | null;
  compareGroupId: string | null;
  parentImageId: string | null;
  referenceImageIds: string[];
  referenceRoles: ReferenceRoleEntry[] | null;     // edit only; brand logo last
  logo: File | null;                   // resolved brand logo to append to the input images
  sourceType: "generate" | "edit";     // "edit" only when mode is edit and imageCount > 0
  inputImageCount: number;             // imageCount + (logo ? 1 : 0)
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Deps = { resolveBrand: (r: BrandRequest) => Promise<ResolvedBrand | { error: string }> };

/** One instant request (generate or edit). */
export function resolveGenerationRequest(
  input: { mode: "generate" | "edit"; raw: RawGenerationInput; brand?: unknown; attachments?: Attachments },
  deps: Deps
): Promise<Result<GenerationRequest>>;

/** The Economy-mode body `{ requests, brand }` -> one BatchRequestMeta per image. */
export function resolveBatchRequests(body: unknown, deps: Deps): Promise<Result<BatchRequestMeta[]>>;

/** Parameters shared by images.generate and images.edit. */
export function toOpenAIParams(request: GenerationRequest): Record<string, unknown>;

/** The argument for persistGeneratedImage. */
export function toImageRow(
  request: PersistableRequest,
  result: { b64: string; revisedPrompt: string | null; reportedSize?: unknown; size?: string;
            durationMs: number | null; usage: UsageFields }
): Parameters<typeof persistGeneratedImage>[0];
```

`ResolvedBrand` is a type-only import from `brand-prompt.ts`; `Parameters<typeof
persistGeneratedImage>` is a type-only import from `save-image.ts`. Use `import type` for both
so the module stays free of `@/db`.

`PersistableRequest` is the subset of `GenerationRequest` that `toImageRow` reads, so batch
ingest can build one from a stored `BatchRequestMeta`. Add `persistableFromBatchMeta(meta)` to
`batch.ts`; it applies `complexityParam` (old stored jobs hold the raw value), sets `mode:
"batch"`, `sourceType: "generate"`, `partials: 0`, `gif: null`, `storedBackground:
meta.background`, and empty edit fields.

#### Rules for `resolveGenerationRequest`

Checked in this order. Messages are verbatim from today's routes.

1. Defaults: `size "1024x1024"`, `quality "medium"`, `format "png"`, `background "auto"`,
   `model DEFAULT_MODEL`, applied when the raw value is `undefined`, `null` or `""`.
2. `promptInputs = sanitizePromptInputs(raw.promptInputs)`; `base = promptInputs?.base ??
   raw.prompt`. Not a non-empty string → `Prompt is required`.
3. `validateSize(size)`.
4. `formatUnavailableReason(format, { model, mode })` (mask is checked in step 8).
5. `validateFormatBackground(format, background)`.
6. Brand. `sanitizeBrandRequest(input.brand)`. In `generate` mode with `include.logo` →
   `Generations with a brand logo go through /api/edit`. Otherwise `deps.resolveBrand`; an
   `{ error }` result is returned as the error.
7. Edit only: `imageCount === 0` and no logo → `At least one reference image is required`.
   `promptInputs.referenceRoles` present with a different length than `imageCount` →
   `referenceRoles must match the number of images`. Roles default to
   `defaultReferenceRole(i)` per image; a logo appends `{ role: "logo" }` last.
8. Edit only, attachments: gif with a mask → `GIF output can't be used with a mask`. With
   markup: a mask too → `Use either a mask or markup, not both`; `imageCount === 0` → `Markup
   needs a reference image to draw on`; `markup.type !== "image/png"` → `Markup must be a PNG`;
   `markup.size > 50 * 1024 * 1024` → `Markup must be under 50 MB`. Mask with a logo → `Turn off
   the Logo chip to edit with a mask`. Mask with `inputImageCount !== 1` → `A mask can only be
   used with a single reference image`.
9. Derived values: `count` (`1` for edit or `formatTraits(format).singleImage`, else
   `clampCount(raw.n)`); `gif` (`normalizeGif` only for gif); `compression`
   (`normalizeCompression` when `takesCompression`, else `null`); `complexity`
   (`complexityParam(model, raw.complexity).complexity ?? null`); `compareGroupId` and
   `parentImageId` (kept only when `isUuid`); `referenceImageIds` (behaviour change 5); `tag`
   (`raw.tag` when a non-empty string, else `null`).
10. Prompt assembly. Keep today's exact condition for when structured inputs are stored:
    - generate: `stored = brand ? { ...(promptInputs ?? { base }), brand: brand.input } :
      promptInputs`.
    - edit: `stored = promptInputs || brand || markup ? { ...(promptInputs ?? { base }),
      referenceRoles, ...(brand ? { brand: brand.input } : {}), ...(markup ? { markup: true } :
      {}) } : null`.
    - `prompt = stored ? buildPrompt(stored) : base`.

#### Rules for `resolveBatchRequests`

Mirror `batch/generate/route.ts`: one brand for the whole batch, resolved once (`include.logo` →
`The brand logo isn't available in Economy mode`). Per item, apply steps 1–5 and 9–10 in `batch`
mode. An item whose prompt is missing is **skipped silently**; any other failing item fails the
whole call with that item's message. Each surviving item expands into `count` metas with a fresh
`randomUUID()` `customId`. An empty result → `At least one prompt is required`.

#### `toOpenAIParams`

Returns `model`, `prompt`, `size`, `quality`, `output_format`, `output_compression` (only when
`compression != null`), `background` (omitted when `!formatTraits(format).takesBackground`),
`complexity` (only when non-null), `frame_count`/`frame_duration_ms` (only for gif), `n: count`.
The caller adds what is endpoint-specific: `stream`/`partial_images`, `svgParams()`, `image`,
`mask`, `markup`.

Note one existing quirk to keep: the streaming branch of the generate route always sends
`background`. Since streaming never happens for svg, `toOpenAIParams` produces the same request.

#### `toImageRow`

Maps to the `persistGeneratedImage` argument. `size` is `result.size` when given (the edit route
passes the composite's dimensions), else `actualSizeOr(request.size, result.reportedSize)`.
`requestedSize: request.size`, `background: request.storedBackground`, `previewPartials:
request.partials`, `outputCompression: request.compression`, `frameCount`/`frameDurationMs` from
`request.gif`, and the new `inputImageCount`.

### Cost estimate (behaviour change 1)

In `pricing.ts` add:

```ts
export type CostRequest = {
  model: string; quality: string; size: string; format: string;
  complexity?: string | null; frameCount?: number | null;
  partials?: number; promptChars?: number; inputImages?: number;
};
/** Table estimate, or the recorded median when `stats` has enough rows. */
export function estimateRequestCost(req: CostRequest, stats?: CostStats | null): CostEstimate;
```

It owns the mapping onto `estimateCostCalibrated` (`frames = frameCount ?? 1`). Add an optional
`inputImageCount` parameter to `persistGeneratedImage` and have it call `estimateRequestCost`
with it (no stats). The panel switches to `estimateRequestCost` in Phase 5.

### Rewire the routes

Each `POST` keeps: `requireOwner()`, decoding the transport into `RawGenerationInput`
(`req.json()` for generate and batch, `decodeEditForm` for edit), calling the module, the OpenAI
call, mask compositing (edit), SVG safety check (generate), SSE emission, and
`persistGeneratedImage(toImageRow(...))`. Everything else in the handler bodies moves behind the
module. Pass `{ resolveBrand }` from `@/lib/brand-prompt` as `deps`. Error responses keep their
current status codes (400 for validation).

`batch-poll.ts` replaces its inline argument block with
`toImageRow(persistableFromBatchMeta(meta), ...)`; `durationMs` stays `null` there (the comment
in that file explains why) and `usage` stays `usageToFields(usage, { batch: true })`.

### Tests

`src/lib/generation-request.test.ts`, using a fake `resolveBrand`:

- Each numbered rule above, one test per message.
- Defaults (behaviour change 7), `count` for png / svg / gif / edit, `partials` with and
  without `preview`, `storedBackground` for svg, `complexity` dropped for a 2.5 model.
- Prompt assembly: plain string with no brand stores `null`; plain string with a brand stores
  `{ base, brand }`; edit with markup stores `markup: true` and roles; logo appends the `logo`
  role last and sets `inputImageCount`.
- `sourceType`: edit with images → `"edit"`; edit with only a logo → `"generate"`.
- `resolveBatchRequests`: skip-missing-prompt, fail-whole-batch, `n` expansion, logo rejection.
- `toOpenAIParams`: svg omits `background`; png omits `output_compression`.
- `toImageRow`: `result.size` wins over `reportedSize`.

`src/lib/edit-form.test.ts`: `decodeEditForm(encodeEditForm(x))` round-trips every field,
optional fields are absent when unset, and both JSON error messages.

**Done when:** the phase gate passes; the three route files contain no call to
`sanitizePromptInputs`, `validateSize`, `validateFormatBackground`, `normalizeCompression`,
`complexityParam`, `normalizeGif` or `buildPrompt`; `persistGeneratedImage(` is always called
with `toImageRow(`; every message in the rule lists has a test.

---

## Phase 3 — image actions

`handleDelete`, `handleFavorite` and `handleTagChange` are near-verbatim copies in
`image-card.tsx` and `image-lightbox.tsx`. `image-brand.tsx` and `compare-dialog.tsx` make their
own calls. `NO_TAG = "No tag"` is defined three times.

### Create `src/lib/image-actions.ts` (pure)

```ts
export type ImageActions = {
  toggleFavorite(image: ImageRecord): Promise<boolean>;
  setTag(image: ImageRecord, tag: string | null): Promise<boolean>;
  setBrand(image: ImageRecord, brandId: string | null): Promise<boolean>;
  remove(image: ImageRecord, opts?: { errorMessage?: string }): Promise<boolean>;
};

export function createImageActions(deps: {
  fetch: typeof fetch;
  onUpdated(image: ImageRecord): void;
  onRemoved(image: ImageRecord): void;
  onError(message: string): void;
}): ImageActions;
```

Each resolves `true` on success. On failure it calls `onError` and resolves `false`. Messages:
`Failed to update favorite` (new), `Failed to update tag`, `Failed to update brand`, `Failed to
delete image` (or `opts.errorMessage`). `setBrand` is a no-op returning `true` when the brand is
unchanged. A thrown `fetch` counts as a failure.

### Create `src/lib/gallery-images.tsx` (client)

- `useGalleryImages({ readOnly })`: owns `images`, `loading` and `pendingBatchJobs`. Move the
  initial load effect and the batch poll effect (including `BATCH_POLL_INTERVAL_MS` and its
  comments) out of `home.tsx`. Returns `{ images, loading, pendingBatchJobs, addImage,
  addBatchJob, actions }` where `actions` is `createImageActions` wired to `window.fetch`, the
  state setters and `toast.error`, memoised so its identity is stable.
- `ImageActionsProvider` and `useImageActions()` (a context carrying `actions`).

`Gallery` is wrapped in `memo` so typing in the prompt does not re-render every card. Keep every
value passed to it, and the context value, referentially stable.

### Rewire

- `home.tsx` uses `useGalleryImages`, wraps the tree in `ImageActionsProvider`, and drops
  `handleDelete` and `handleImageUpdated`.
- `Gallery`, `ImageCard`, `ImageLightbox`, `SetBrandSelect` and `CompareDialog` drop their
  `onDelete` / `onImageUpdated` props and call `useImageActions()`. Local UI state stays where
  it is: `deleting`, `confirmingDelete`, the lightbox's index adjustment after a successful
  `remove`, the compare dialog's `deletingId` and its custom message (`Failed to delete the
  ${modelShortName(other.model)} image`, passed as `errorMessage`).
- Export `NO_TAG` from `src/lib/tags.ts` and delete the three local copies.
- `PATCH /api/images/[id]`: validate `tag` against `ASSIGNABLE_TAGS` (behaviour change 4) and
  replace the comment that says validation is client-side.

### Tests

`src/lib/image-actions.test.ts` with a fake `fetch`: each action's request (method, URL, body),
`onUpdated` / `onRemoved` on success, `onError` message and `false` on a non-OK response and on
a thrown fetch, `setBrand` no-op.

**Done when:** the phase gate passes; `grep -rn "/api/images/\${" src/components` matches
nothing; `grep -rn "NO_TAG = " src` matches once.

---

## Phase 4 — reference set

"The same image is never a reference twice" is enforced in three places with two identity rules
(`dedupeReferences` in `reference-items.ts`, `withoutDuplicates` in the picker, two
`sourceImageId` checks in `home.tsx`). Mask and markup ownership is tracked beside the list with
`maskOwnerKey` / `markupOwnerKey`. The role-mapping expression is written twice in
`generate-panel.tsx`.

### Create `src/lib/reference-set.ts` (pure)

Move the `ReferenceItem` type here and extend it; `reference-items.ts` keeps the browser-only
constructors (`referenceItemFromImage`, `referenceItemFromFile`, `rasterizeSvg`,
`firstFrameAsPng`) and imports the type.

```ts
export type ReferenceItem = {
  key: string; file: File; previewUrl: string;
  sourceImageId?: string; role?: ReferenceRole; note?: string;
  mask?: File;      // drawn on this item
  markup?: File;    // drawn on this item
};

/** "gallery:<id>" for a gallery image, "file:<name>|<size>|<lastModified>" for an upload. */
export function referenceIdentity(item: ReferenceItem): string;

/** Appends `incoming`, dropping anything whose identity or key is already present. */
export function addReferences(items: ReferenceItem[], incoming: ReferenceItem[]): ReferenceItem[];
export function removeReference(items: ReferenceItem[], key: string): ReferenceItem[];
export function updateReference(items: ReferenceItem[], key: string, patch: Partial<ReferenceItem>): ReferenceItem[];
export function hasReference(items: ReferenceItem[], imageId: string): boolean;

/** The only item when there is exactly one, else null (a mask needs a single input image). */
export function maskTarget(items: ReferenceItem[]): ReferenceItem | null;
/** The first item, or null (markup is drawn over image 1). */
export function markupTarget(items: ReferenceItem[]): ReferenceItem | null;
export function activeMask(items: ReferenceItem[]): File | null;    // maskTarget(items)?.mask ?? null
export function activeMarkup(items: ReferenceItem[]): File | null;  // markupTarget(items)?.markup ?? null

/** One entry per item: explicit role or the positional default, plus a trimmed non-empty note. */
export function referenceRoles(items: ReferenceItem[]): ReferenceRoleEntry[];
/** `parentImageId` while that image is still one of the references, else null. */
export function refinementParent(items: ReferenceItem[], parentImageId: string | null): string | null;
```

`addReferences` returns the same array instance when nothing was added (the picker and Home rely
on stable identity to avoid re-renders).

Storing `mask` / `markup` on the item reproduces today's ownership behaviour: a mask goes
inactive when a second reference is added and returns if it is removed; markup disappears with
the first image.

### Rewire

- `home.tsx`: replace the `rawReferenceItems` + `dedupeReferences` wrapper and both
  `sourceImageId` checks with `addReferences` / `hasReference`. Keep the "That image is already a
  reference" toast.
- `reference-images-picker.tsx`: delete `withoutDuplicates`; use `addReferences`,
  `removeReference`, `updateReference`.
- `generate-panel.tsx`: delete `maskFile`, `maskOwnerKey`, `markupFile`, `markupOwnerKey`; save
  and clear through `updateReference(items, target.key, { mask })` etc.; replace both role
  mappings with `referenceRoles(items)` and the `activeParentId` expression with
  `refinementParent`.
- Delete `dedupeReferences`.

### Tests

`src/lib/reference-set.test.ts`: both identity forms; adding the same gallery image twice;
adding the same upload twice; same-array return when nothing is added; mask inactive with two
items and active again after removal; markup follows the first item; `referenceRoles` defaults
and note trimming; `refinementParent`.

`File` exists in Node 20+, so tests construct items directly with a fake `previewUrl`.

**Done when:** the phase gate passes; `grep -rn "OwnerKey\|withoutDuplicates\|dedupeReferences"
src` matches nothing; `defaultReferenceRole(` appears in `src/components` only inside
`reference-images-picker.tsx` (the role select's display).

---

## Phase 5 — composer draft

`generate-panel.tsx` (about 1,400 lines) holds some 37 `useState` calls, takes 22 props, and
computes every rule about a draft as a local constant inside the render function. `home.tsx`
lifts six pieces of draft state and passes each back down as a value/setter pair. Refine and Use
as prompt are sequences of setters in Home. None of this can be exercised without rendering.

Do this phase in four steps. Run the phase gate after each.

### 5a — pure derivation

Create `src/lib/composer-draft.ts`.

```ts
export type ComposerState = {
  // prompt inputs
  prompt: string; exactText: string; changeOnly: string; preserve: PreserveId[];
  references: ReferenceItem[]; parentImageId: string | null;
  // output settings
  aspectRatio: string; tier: SizeTier; customW: string; customH: string;
  quality: string; format: string; background: string;
  compression: number | null; modelOverride: string | null; complexity: Complexity;
  n: number; gifFrames: number; gifFrameMs: number; tag: string;   // NO_TAG when unset
  // modes
  economy: boolean; compare: boolean; compositeMask: boolean;
  // brand
  brandInclude: BrandInclude; logoVariant: LogoVariant; reskinPreset: boolean; replaceContact: boolean;
  // Economy queue
  queue: QueuedPrompt[];
};

export type ComposerEnv = {
  activeBrand: BrandRecord | null;
  visibility: PanelOptionVisibility;
  defaultModel: string;
  livePreview: boolean;
  costStats: CostStats | null;
};

export function initialComposerState(): ComposerState;
export function deriveDraft(state: ComposerState, env: ComposerEnv): DraftView;
```

`DraftView` carries every value the panel currently derives between the `useState` block and
`applyPreset` (roughly lines 251–402): `model`, `complexity`, `comparePair`, `economyMode`,
`isEditMode`, `reskinOn`, `maskableItem`, `markupItem`, `activeMask`, `activeMarkup`,
`logoBlocked`, `logoOn`, `usesEditEndpoint`, `brandRequest`, `svgAvailable`, `gifAvailable`,
`format`, `isSvg`, `isGif`, `n`, `compressionApplies`, `compression`, `previewApplies`,
`compareOn`, `previewOn`, `partials`, `isCustomSize`, `size`, `sizeError`, `inputImages`,
`cost: { usd, approximate }`, `queuedImageCount`, `promptInputs`, `activeParentId`, `tagValue`.
Keep the names; the JSX already uses them.

Port the expressions as they are, with their comments, then replace the pieces earlier phases
own: `formatTraits` for the svg/gif `n`, compression and streaming rules; `supportsSvg` /
`supportsGif` stay as model checks; `estimateRequestCost` for both the draft and the queue
estimate; `reference-set` functions for mask, markup and parent.

Add:

```ts
export type Submission =
  | { kind: "blocked"; message: string }                       // toast.error(message)
  | { kind: "batch"; body: { requests: unknown[]; brand: BrandRequest | null } }
  | { kind: "compare"; compareGroupId: string; payloads: [Record<string, unknown>, Record<string, unknown>] }
  | { kind: "generate"; payload: Record<string, unknown> }
  | { kind: "edit"; fields: EditFormFields };

export function buildSubmission(state: ComposerState, view: DraftView, newId: () => string): Submission;
```

It reproduces the branching and payload shapes of `handleSubmit` (lines 484–642) without doing
I/O: `sizeError` and the empty-prompt cases become `blocked` (`Enter a prompt first`, `Add a
prompt to the queue first`); batch strips the queue item `id`; compare builds one payload per
model in `comparePair` sharing `compareGroupId`; edit produces `EditFormFields` for
`encodeEditForm`. `newId` is injected so tests are deterministic. The unfilled-placeholder
confirmation stays in the panel, before `buildSubmission` is called.

In this step the panel keeps its `useState` calls: assemble a `ComposerState` from them, call
`deriveDraft` and `buildSubmission`, and delete the local derivations and the payload-building
half of `handleSubmit`. `handleSubmit` becomes a `switch` over `submission.kind` that performs
the fetches, stream callbacks and toasts exactly as today.

Tests, `src/lib/composer-draft.test.ts`:

- svg falls back to png with references, with a logo, in Economy mode, and on a 2.5 model; gif
  falls back with a mask and in Economy mode.
- `logoBlocked` for Economy mode and for a mask; `logoOn` requires the brand to have logos.
- `usesEditEndpoint` with references, and with only a logo.
- A hidden option stops being sent: `visibility.compression`, `visibility.exactText`,
  `visibility.preserve`, `visibility.economy`, `visibility.compare`, `visibility.preview`.
- `previewOn` / `compareOn` preconditions; `partials`.
- `size` for a ratio + tier, for `Custom`, and `sizeError` for an invalid custom size.
- `brandRequest` shape, including `replaceContactInfo` only when re-skin is on.
- `cost`: `n` multiplies it, Economy halves it, compare sums both models, an edit counts input
  images, svg is approximate.
- `buildSubmission`: one test per `kind`, asserting the full payload.

### 5b — state into a reducer

Add `composerReducer(state, action)` to `composer-draft.ts` and create `src/lib/use-composer.ts`
(client): `useComposer(env)` wraps `useReducer`, computes `deriveDraft` with `useMemo`, and
returns `{ state, view, dispatch, ...named helpers }`.

Reducer actions cover every setter the panel has today, plus these compound transitions, each
ported from the function named:

| Action | Ports | Notes |
|---|---|---|
| `set` (field, value) | the plain setters | |
| `setBackground` | `setBackground` | jpeg + transparent switches `format` to png |
| `applyPreset` (preset, language, hasBrand) | `applyPreset` | sets prompt scaffold, size, quality, format, background, preserve, brandInclude, reskinPreset; clears replaceContact |
| `setReplaceContact` | `handleReplaceContact` | adjusts `preserve` and `brandInclude.standingText` |
| `togglePreserve` | `togglePreserve` | |
| `addToQueue` (id, view) | `handleAddToQueue` | appends a snapshot, clears prompt |
| `removeFromQueue` | `removeQueueItem` | |
| `batchSubmitted` | after a successful batch | clears queue and prompt |
| `editSubmitted` | after a successful edit | clears `parentImageId` |
| `addReferences` / `removeReference` / `updateReference` | reference-set | the only ways references change |
| `refine` (image, item) | `handleRefine` in Home | replaces references with `[item]`, copies `changeOnly` / `preserve` from the image, sets parent, clears prompt |
| `useAsPrompt` (image) | `handleUseAsPrompt` in Home | restores `base` / `exactText`; overwrites edit constraints only when the image recorded them |
| `defaultModelChanged` | the `prevDefaultModel` block | clears `modelOverride` |

Side effects stay in the hook's helpers, outside the reducer: toasts (`Switched to PNG — JPEG
can't be transparent`, the `Applied preset: …` summary, `Added to queue`), fetching the blob in
`referenceItemFromImage`, the brand-mismatch toasts in `handleRefine`, focusing `#prompt`, and
switching the mobile tab.

Purely presentational state stays in `generate-panel.tsx` as `useState`: `maskEditorOpen`,
`markupEditorOpen`, `exactTextOpen`, `preserveOpen`, `promptExpanded`, `assistOpen`,
`placeholderWarn`, `pendingPreset`, `isSubmittingBatch`.

Add reducer tests for every compound transition in the table.

### 5c — lift out of Home

`home.tsx` calls `useComposer(env)` once and passes the result to the panel as a single
`composer` prop. Delete from Home: `prompt`, `exactText`, `changeOnly`, `preserve`,
`parentImageId`, the reference state, and the bodies of `handleRefine`, `handleUseAsPrompt` and
`handleUseAsReference` (they become helpers on the hook that dispatch `refine`, `useAsPrompt`
and `addReferences`). `isEditing` moves into the hook as well; Home still reads it for
`pendingPreviews`.

`GeneratePanel`'s props become: `composer`, `generateStream`, `compareStream`, `onImageCreated`,
`onBatchSubmitted`, `onCompareDone`.

### 5d — composer actions for the gallery

Add `ComposerActionsProvider` / `useComposerActions()` in `use-composer.ts`, exposing `{ refine,
useAsPrompt, useAsReference }` with stable identities. `Gallery`, `ImageCard` and `ImageLightbox`
drop their `onRefine`, `onUseAsPrompt` and `onUseAsReference` props and call the hook.

**Done when:** the phase gate passes; `generate-panel.tsx` contains no `fetch(` payload
construction and no `new FormData`; `grep -c "useState" src/components/generate-panel.tsx` is at
most 10; `GeneratePanel` takes the six props listed in 5c; `Gallery` takes no `on*` callback
props for image or composer actions; every `DraftView` rule and compound transition listed above
has a test.

---

## Hand-off

When all phases pass, update the docs that describe the old structure: `SPEC.md` and `PLAN.md`
both name files this plan moves code out of (`generate-panel.tsx`, `src/lib/openai.ts`), and
`PLAN.md` prescribes mocking `window.fetch` for verification (mention `pnpm test` beside it).
`ENHANCEMENTS.md` is a historical record; leave it. Then report to the user:

- The result of the four phase-gate commands.
- The seven intended behaviour changes, each marked as landed or not.
- Anything you could not make byte-identical, with the before and after.
- This manual smoke list for the user to run, since each item spends OpenAI credits or needs a
  browser:
  1. Generate one image with live preview on; check partial frames, the saved row and its cost.
  2. Generate `n = 4`; check four tiles fill in.
  3. Generate an SVG and a GIF on a 2.6 model.
  4. Compare models; keep one in the dialog.
  5. Edit with one reference and a mask, with "Keep unmasked area pixel-identical" on.
  6. Edit with two references, roles and notes; edit with markup.
  7. Branded generation with the Logo chip on (goes through `/api/edit`, stored as a
     generation); check the stored cost estimate now includes the logo.
  8. Economy mode: queue two prompts, submit, wait for ingest.
  9. Refine from the lightbox; check the versions strip. Use as prompt. Use as reference twice
     (second shows "That image is already a reference").
  10. Favorite, tag, set brand and delete from both the card and the lightbox.
  11. Apply a generate preset, an edit preset and the re-skin preset.
  12. View the app signed out: everything read-only, no write requests.
