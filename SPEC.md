# Image Studio — Spec

A private, single-user web app for generating and managing images with OpenAI's image models. Built with Next.js, Neon Postgres, Vercel Blob, and Clerk auth, deployed on Vercel.

**Live**: https://image-generator-ruddy-one.vercel.app
**Repo**: https://github.com/dcatcherex/image_generator

## 1. Purpose & Scope

A personal tool to generate, edit, and organize AI-generated images without the friction of ChatGPT/Playground UIs. Not a multi-tenant product — one account (via Clerk), no team/sharing features, no billing.

**In scope (v1, built):**
- Text-to-image generation with live streaming preview
- Image editing from one or more reference images
- Mask-based inpainting (edit only a painted region of a single reference image)
- Gallery with prompt search, favorites, fixed-tag filter, storage usage, delete
- Batch generation (`n` = 1/2/4 per instant request — see §5.1)
- Actual cost + latency recorded per image from the response `usage`; estimates calibrate from those actuals (see §6)
- Size tiers (1K/2K/4K-experimental) combined with the aspect-ratio picker (see §5.1)
- Transparency guard, `output_compression`, server-side alpha check (see §5.1)
- "Compare models" — Flare and Sunburst side by side (see §5.6)
- Edit workflow: reference roles, change-only/preserve constraints, Refine loop with a versions strip, mask compositing (see §5.2)
- Prompt authoring: presets and an exact-text input, assembled by `buildPrompt()` (see §5.7)
- "Economy mode" — real OpenAI Batch API submission for ~50% cheaper, async (up to 24h) generation, as a separate opt-in path (see §5.5)
- Auth-gated (Clerk), deployed on Vercel

**Explicitly out of scope (deferred):**
- Freeform tags/collections (a fixed 6-value tag list is implemented instead — see §3)
- Multi-user / team features, sharing, roles
- Automatic mask suggestions (e.g. segmentation)
- Economy mode for the Edit/Reference flow (Generate only, for now)
- Edit `n > 1`, LLM-based prompt rewriting, automatic QA of rendered text accuracy
- Cancelling a submitted Economy-mode batch from the UI

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | Existing Vercel-native default |
| Package manager | pnpm | Avoids npm's optional-dependency bug on Windows that broke native builds (lightningcss/oxide) |
| UI | shadcn/ui on Base UI, Tailwind v4 | Design system requested by user, monochrome/soft theme |
| Fonts | Poppins (headings), Inter (body) | Matches extracted design tokens |
| Auth | Clerk (`@clerk/nextjs`) | Gate the whole app behind sign-in before public deploy |
| Database | Neon Postgres + Drizzle ORM | Image metadata; provisioned via Vercel Marketplace |
| File storage | Vercel Blob (public access) | Generated image binaries |
| AI provider | OpenAI Images API (`openai` SDK) | `gpt-image-2.5-flare` (generate), `gpt-image-2.5-sunburst` (edit/inpaint) |
| Image processing | `sharp` (Node runtime) | Alpha check on transparent outputs, server-side mask compositing |
| Hosting | Vercel | Git-connected; pushes to `master` auto-deploy to production |

## 3. Data Model

Two tables (Drizzle schema in `src/db/schema.ts`). Every row→client mapping goes through `rowToImageRecord()` in `src/lib/image-record.ts`.

### `images`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | `defaultRandom()` |
| `prompt` | text, not null | User's prompt |
| `revised_prompt` | text, nullable | OpenAI's rewritten prompt, if any |
| `model` | text, not null | e.g. `gpt-image-2.5-flare` |
| `size` | text, not null | The **actual returned dimensions** when the API reports them (`auto` returns non-multiple-of-16 sizes like `1254x1254`); for edits with a mask, the original's dimensions |
| `quality` | text, not null | `low` / `medium` / `high` / `xhigh` / `max` / `auto` |
| `format` | text, not null, default `png` | `png` / `jpeg` / `webp` |
| `background` | text, not null, default `auto` | `auto` / `transparent` / `opaque` |
| `blob_url` | text, not null | Public Vercel Blob URL |
| `blob_pathname` | text, not null | Blob path, used for deletion |
| `favorite` | boolean, not null, default false | |
| `tag` | text, nullable | One of the fixed `ASSIGNABLE_TAGS` in `src/lib/tags.ts`, or `null` for untagged |
| `source_type` | text, not null | `"generate"` \| `"edit"` |
| `reference_image_ids` | jsonb string[], default `[]` | Gallery images used as references for an edit |
| `cost_estimate` | numeric(10,4), nullable | Estimated USD cost at generation time (see §6) |
| `actual_cost` | numeric(10,4), nullable | USD computed from `usage` (`actualCostFromUsage`); Batch rows use the 50% multiplier |
| `requested_size` | text, nullable | What the user asked for (`auto` or `WxH`); cost stats group by this |
| `preview_partials` | integer, nullable | Streamed partial images requested (0 when live preview is off) |
| `input_tokens` / `input_image_tokens` / `output_tokens` | integer, nullable | From `usage`; split evenly across images for `n > 1` |
| `duration_ms` | integer, nullable | Server-measured OpenAI request start → final image bytes. Never set for batch rows (which also keeps them out of cost stats) |
| `output_compression` | integer, nullable | 0–100, JPEG/WebP only, only set if the user moved the slider |
| `transparency_ok` | boolean, nullable | Only set when background = transparent: true if the decoded image has any non-opaque pixel |
| `parent_image_id` | uuid, nullable | Refine chain; deliberately not a FK so deleting a parent doesn't cascade |
| `prompt_inputs` | jsonb, nullable | `PromptInputs` (base, exactText, changeOnly, preserve, referenceRoles); `prompt` holds the assembled final text |
| `reference_roles` | jsonb, nullable | `[{role, note?}]`, aligned with upload order / `reference_image_ids` |
| `compare_group_id` | uuid, nullable | Shared by the two images of a model comparison |
| `created_at` | timestamptz, not null, default now | |

### `batch_jobs` (Economy mode — see §5.5)

Deliberately separate from `images`: a batch job has its own lifecycle spanning multiple images that don't exist yet.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | `defaultRandom()` |
| `openai_batch_id` | text, not null | OpenAI's `batch_...` id |
| `input_file_id` | text, not null | OpenAI's `file-...` id for the uploaded `.jsonl` |
| `output_file_id` | text, nullable | Set once OpenAI finishes processing |
| `error_file_id` | text, nullable | Set if any requests in the batch errored |
| `status` | text, not null | Mirrors OpenAI's batch status (`validating`\|`in_progress`\|`finalizing`\|`completed`\|`expired`\|`cancelling`\|`cancelled`\|`failed`), plus our own `"ingested"` once a completed batch's output has been turned into real `images` rows |
| `request_count` | integer, not null | How many images were requested in this batch |
| `completed_count` | integer, not null, default 0 | |
| `failed_count` | integer, not null, default 0 | |
| `requests` | jsonb, not null, default `[]` | Array of `{customId, prompt, size, quality, format, background, model, tag, compression?, promptInputs?}` — one entry per submitted `.jsonl` line, used to correlate OpenAI's `custom_id`-keyed results back to original params at ingestion time |
| `created_at` | timestamptz, not null, default now | |
| `updated_at` | timestamptz, not null, default now | |

No separate `users` table — auth/identity is entirely delegated to Clerk; the app has no concept of per-user rows since it's single-account.

## 4. Application Structure

```
src/
  app/
    page.tsx                    Main UI: header, GeneratePanel, Gallery
    layout.tsx                  Fonts, ClerkProvider, ThemeProvider, Toaster
    sign-in/[[...sign-in]]/     Clerk sign-in page
    sign-up/[[...sign-up]]/     Clerk sign-up page
    api/
      generate/route.ts         POST — text-to-image, SSE streaming (n=1) or non-streaming batch-of-N (n>1)
      edit/route.ts              POST — image edit + mask, multipart form
      images/route.ts            GET — list images (search, favorites, tag filter)
      cost-stats/route.ts        GET — median actual cost per model|quality|requested_size (instant rows only)
      images/[id]/route.ts       PATCH (favorite toggle, tag set) / DELETE
      storage-usage/route.ts     GET — total Blob bytes + count
      batch/generate/route.ts    POST — submit an Economy-mode batch job to OpenAI's Batch API
      batch/route.ts             GET — list non-terminal batch_jobs (for gallery pending tiles)
      batch/poll/route.ts        POST — client-triggered check-and-ingest (Clerk-protected)
      batch/cron/route.ts        GET — cron target (Cloudflare Worker + Vercel Cron), check-and-ingest (CRON_SECRET-protected, public route)
  components/
    generate-panel.tsx          Presets, prompt + exact text, settings (size/tier/quality/format/compression/background), Economy/Compare/Live-preview toggles, change-only + preserve chips, submit
    mask-editor.tsx             Canvas-based inpainting mask painter (Dialog)
    gallery.tsx                 Grid, search, favorites/tag filters, storage usage, pending-batch tiles
    image-card.tsx              Per-image tile: favorite/tag/download/delete/use-as-reference/refine, cost + duration, opaque-transparency badge
    image-lightbox.tsx          Full-size view, metadata (cost/duration/tokens), versions strip
    compare-dialog.tsx          Side-by-side result of a model comparison (keep both / keep one)
    reference-images-picker.tsx Reference thumbnails; role select + note per image when there are 2+
    theme-provider.tsx / theme-toggle.tsx
    ui/                         shadcn/ui primitives (Base UI-backed)
  lib/
    openai.ts                   OpenAI client, model/quality/n constants, size tiers, validateSize(), format/compression validation
    pricing.ts                  Official 2.5 output-token table, actualCostFromUsage, calibrated estimates, THB formatter (see §6)
    prompt-builder.ts           PromptInputs types, buildPrompt(), sanitizePromptInputs() — all prompt wording lives here
    prompt-presets.ts           Client-side preset library (generate + edit)
    mask-composite.ts           sharp-based mask compositing for edits
    version-chain.ts            Refine-chain lookup for the lightbox
    image-record.ts             rowToImageRecord()
    use-cost-stats.ts / use-live-preview.ts   Client hooks (calibration data; persisted preview toggle)
    tags.ts                     Fixed assignable-tag list + "All" filter sentinel
    batch.ts                    Economy-mode types, .jsonl builder, batch-output-line parser
    batch-poll.ts                checkAndIngestPendingBatches() — shared by the poll and cron routes
    save-image.ts               Uploads to Blob, runs the alpha check, inserts the DB row (shared by generate/edit/batch-ingestion)
    use-image-stream.ts         Client hook: SSE parsing for streaming generation
    sse.ts                      Server-side SSE event encoder
    reference-items.ts          Converts gallery images / disk files into edit-reference items
    types.ts                    Shared TS types (ImageRecord, BatchJobRecord, stream events)
  db/
    schema.ts, index.ts         Drizzle schema (images, batch_jobs) + lazy DB client
  proxy.ts                      Clerk middleware — gates all routes except /sign-in, /sign-up, /api/batch/cron
vercel.json                     Vercel Cron config (hits /api/batch/cron daily at 00:00 UTC)
```

## 5. Core Flows

### 5.1 Generate (text-to-image)
1. User types a prompt (optionally picks a preset and/or fills Exact text), sets aspect ratio + size tier/quality/format/compression/background/model/tag/n (1/2/4), clicks Generate. The size is `sizeFromAspectRatio(w, h, tier)` (tiers: 1K = 1536×1024 area, 2K = 2560×1440, 4K experimental = 3840×2160; edges floored to multiples of 16, ≤ 3840, ≤ 3:1); `validateSize()` re-checks it server-side in all generation routes. JPEG + transparent is rejected (400) and disabled in the UI; compression is only sent for JPEG/WebP once moved.
2. Client (`useImageStream`) POSTs JSON to `/api/generate`.
3. The client sends `promptInputs`; the server builds the final prompt with `buildPrompt()`. If `n === 1`: server calls `openai.images.generate({ ..., stream: true, partial_images: preview ? 2 : 0 })`. **Live preview is a panel toggle, default off** — each partial bills image output tokens (observed ≈ 77 for two frames, so the 100-token-each figure is an upper bound). Partials are re-emitted as SSE `partial` events; the `image_generation.completed` event carries `usage`, `size` and stops the latency clock. The final image is uploaded to Blob, alpha-checked if transparent, and saved with actual cost/tokens/duration; a `done` event carries the `ImageRecord` (plus a `warning` if a transparent background came back opaque). With preview on the client shows partials as the top-left gallery tile; with it off, a pulsing placeholder.
4. If `n > 1`: server calls `openai.images.generate({ ..., n, stream: false })` (no live preview — OpenAI's streaming events don't disambiguate which image-of-a-batch a partial belongs to), then emits one synthetic `done` event per image as each is persisted, so the gallery fills in tiles progressively. Response `usage` is split evenly across the images. Gallery shows `n` pulsing placeholder tiles that count down as each `done` arrives.

### 5.2 Edit (image-to-image)
1. User switches to "Edit / Reference" tab, adds 1+ reference images (upload from disk, or "Use as reference" on any gallery tile).
2. Optionally opens the mask editor (only offered when exactly one reference image is present — masks apply to a single base image).
3. Each reference gets a role (Subject / Style / Clothing or item / Scene or background / Other) and optional note once there are 2+ images (default: first = subject, rest = other). Edit mode also shows a "Change only…" input and preserve chips. All of this travels as `promptInputs` and is assembled into an "Inputs / Change only / Constraints" prompt by `buildPrompt()`.
4. Submits: client POSTs `multipart/form-data` to `/api/edit` (`promptInputs` JSON, settings, reference image files, optional mask file and `compositeMask`, optional `parentImageId`). Server calls `openai.images.edit({ image, mask?, ... })` (non-streaming), records usage/duration, saves like generate.
5. **Mask compositing** (on by default; "Keep unmasked area pixel-identical" checkbox): `compositeMaskedEdit()` (sharp) pastes the edited region back onto the original using the mask (transparent = edit) with an inward-only ~2px feather, so protected pixels stay byte-identical (exact for PNG; JPEG/WebP re-encode). The composite's dimensions are stored as `size`. If compositing fails, the raw model output is saved with a warning.
6. **Refine** (wand action on a card/lightbox): replaces the references with that one image, carries its change-only/preserve constraints forward, clears the prompt and records it as `parent_image_id` for the next edit. The lightbox shows a Versions strip built from the parent chain.

### 5.3 Mask-based inpainting
- `mask-editor.tsx` renders the reference image under a fully opaque white `<canvas>` overlay.
- Painting uses `globalCompositeOperation = "destination-out"` to erase the overlay, revealing the photo — erased (transparent) regions become the "edit this" area per OpenAI's mask convention (transparent = editable, opaque = protected).
- On save, `canvas.toBlob()` produces the mask PNG directly (correct alpha channel, no extra encoding step).
- The saved mask (a `File`) is lifted into `generate-panel.tsx` state and passed back into `MaskEditor` as `initialMask` so reopening the editor restores prior work (dialogs unmount on close, so canvas state doesn't survive on its own).
- A cursor-following circle (sized to the brush) gives live feedback on paint radius, using `mix-blend-difference` so it's visible against both dark and light regions.

### 5.4 Gallery management
- Search/filter API supports `/api/images?q=&favorites=&tag=` (`ILIKE` on prompt, favorite filter, exact tag match), ordered by `created_at desc`, limit 200. The client currently applies search/favorites/tag filtering client-side over the full fetched list rather than re-querying per filter change (same pattern for all three).
- Favorite toggle / tag assignment: `PATCH /api/images/:id` with `{favorite}` and/or `{tag}` (tag `null` clears it). Tags are a fixed 6-value list (`src/lib/tags.ts`) assignable either at generation time (`generate-panel.tsx`) or after the fact (`image-card.tsx`'s tag-icon dropdown) — the latter matters because it's the only way to tag already-existing images.
- Delete: `DELETE /api/images/:id` — deletes the DB row and the Blob object.
- Storage usage: `/api/storage-usage` lists all blobs under `images/` and sums size — polled on gallery mount and after each generation.

### 5.5 "Economy mode" (real OpenAI Batch API)
1. User flips the "Economy mode" switch in `generate-panel.tsx` (Generate tab only), which shows a `~50% cheaper` badge and swaps the cost estimate to `estimateCost() × 0.5`.
2. Submitting posts JSON to `POST /api/batch/generate`: server builds a `.jsonl` (one line per requested image, `custom_id` = a fresh UUID, targeting `/v1/images/generations`), uploads it via `openai.files.create({ purpose: "batch" })`, creates the batch via `openai.batches.create({ input_file_id, endpoint: "/v1/images/generations", completion_window: "24h" })`, and inserts a `batch_jobs` row. No streaming, no live preview — the response is just a submission confirmation.
3. `page.tsx` fetches `GET /api/batch` on mount and renders one dashed-border "Pending — up to 24h" placeholder tile per still-expected image (`sum of requestCount` across non-terminal jobs) — these placeholders are DB-backed, not client-memory-only, so they **survive a page reload** (a batch can take hours).
4. While anything is pending, the client polls `POST /api/batch/poll` every 45s (responsiveness while a tab is open); a **Cloudflare Worker cron** hitting `GET /api/batch/cron` every 15 min (plus a daily Vercel Cron fallback) is the reliability backstop that keeps working even when nobody has the app open.
5. Both poll routes call the same `checkAndIngestPendingBatches()` (`src/lib/batch-poll.ts`): retrieves the batch from OpenAI, updates status/counts, and — the first time it sees `status: "completed"` — fetches the output file, parses each line (correlating by `custom_id`, **not** line order, per OpenAI's own docs warning that output order isn't guaranteed), looks up the original request params, and calls the same `persistGeneratedImage()` the instant flow uses. The row then flips to our own `"ingested"` status so it's never re-processed. Once ingested, the resulting images just show up in the normal `/api/images` list and the placeholder tiles for that job naturally disappear (the job drops out of the non-terminal `GET /api/batch` list).

### 5.6 Compare models
Panel toggle (instant, n=1 only; hidden in edit/Economy/n>1). The client fires two `/api/generate` requests in parallel — identical except `model` — sharing a client-made `compareGroupId` (stored in `compare_group_id`), using two `useImageStream` instances. Both results open in `CompareDialog` (duration + actual cost per model); "Keep Flare"/"Keep Sunburst" deletes the other via `DELETE /api/images/[id]`.

### 5.7 Prompt authoring
`PromptInputs` → `buildPrompt()` (`src/lib/prompt-builder.ts`) is the single place prompt wording lives; the server is authoritative and a plain `prompt` string is still accepted (`{ base: prompt }`). Presets (`prompt-presets.ts`) only fill the plain textarea with a labelled-section scaffold and set recommended params/preserve chips. "Exact text" appends a verbatim-text instruction. "Use as prompt" restores `prompt_inputs.base`, exact text and (when recorded) the change-only/preserve state. Settings can hide each panel section (`use-panel-options.ts`).

## 6. Cost Estimation

Numbers come from `src/docs/gpt-image-2.5-pricing-reference.md` (official GPT Image 2.5 token table and rates; the Batch discount is verified at exactly 50% from billing).

- **Actual cost**: `actualCostFromUsage(usage, {batch})` = text-in × $5/M + image-in × $8/M + image-out × $30/M (× `BATCH_PRICE_MULTIPLIER` = 0.5 for batch). Recorded per image from the streamed completed event, the non-streaming response, or batch output lines; a missing `usage` is tolerated (columns stay null).
- **Estimate**: `estimateCost(quality, size, {partials, promptChars})` = table output tokens × $30/M + preview partials × 100 tokens × $30/M + ⌈chars/4⌉ × $5/M. Sizes not in the table use the documented size with the nearest area and same orientation (no megapixel scaling); `auto` size/quality fall back to 1024×1024 / medium. Table-based values show a `~`.
- **Calibration**: `GET /api/cost-stats` returns the median `actual_cost` per `model|quality|requested_size` over instant rows (`actual_cost` and `duration_ms` set). The panel uses it instead of the table once a combo has ≥ 3 rows, and refetches after each generation. Economy mode multiplies by 0.5.
- THB display uses a fixed 33 THB/USD (`formatCostThb`), an app assumption.
- Cards/lightbox show the actual cost (or the stored estimate with `~`), plus duration and tokens in the lightbox.

## 7. Auth & Access Control

- Clerk auth is enforced per resource, not in middleware (`createRouteMatcher` is deprecated): `src/proxy.ts` only runs `clerkMiddleware()`; `src/app/page.tsx` calls `auth.protect()` and every API route handler calls `requireUser()` (`src/lib/require-user.ts`) except `/api/batch/cron`. Any new page or route must add its own check. The cron route is the one deliberate exception: cron invocations carry no Clerk session, so it authenticates itself via a `CRON_SECRET` bearer token instead (checked inside the route handler, fails closed with 500 if `CRON_SECRET` isn't set).
- No role/permission model — single account, full access once signed in.
- **Staying on Clerk development keys for now, by user decision** (usage-limited, shows a "Development mode" badge). Production keys would require running Clerk's interactive domain-setup wizard (`clerk deploy`) by hand — not automatable from an agent session. Revisit if/when usage limits become a problem.

## 8. Deployment

- Vercel project `image-generator` (team `dcatcherexgmailcoms-projects`), Git-connected to `github.com/dcatcherex/image_generator`. Pushes to `master` auto-deploy to Production.
- Env vars (Production/Preview/Development, set via `vercel env add`): `DATABASE_URL`(+`_UNPOOLED`), `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, plus Clerk's sign-in/up redirect URL vars, and `CRON_SECRET` (also stored as a secret on the Cloudflare Worker — keep both in sync; see PLAN.md §10).
- `vercel.json` configures a Vercel Cron job hitting `/api/batch/cron` once a day (00:00 UTC). The Hobby plan only allows daily crons and **rejects deployments** with a more frequent schedule; on Pro+ this can go back to `*/15 * * * *`.
- Cloudflare Worker `image-generator-cron` (dashboard-managed, not in this repo) has a Cron Trigger `*/15 * * * *` that `fetch`es `/api/batch/cron` with `Authorization: Bearer $CRON_SECRET` — this is the primary 15-min backstop on Hobby.
- Local dev: `pnpm dev` (Turbopack — works fine under pnpm's strict `node_modules`; explicitly broke under npm's flat layout, hence the pnpm migration).
- `drizzle-kit push` against `DATABASE_URL_UNPOOLED` (direct connection; pooled connection doesn't support the session-level operations migrations need). Run via `pnpm exec dotenv -e .env.local -- pnpm exec drizzle-kit push` since the CLI doesn't auto-load `.env.local`.

## 9. Known Gaps / Follow-ups

- Clerk still on development keys — by user decision, not currently planned (§7).
- `actual_cost` is `numeric(10,4)`, so low-quality images round by up to ~1%; widen the scale if that matters.
- The 2048×2048 rows of the official token table price above 3840×2160 (recheck in the calculator before trusting estimates there). 4K generation time vs `maxDuration = 300` is untested.
- `sharp` on the Vercel production build hasn't been confirmed (only run locally).
- Not yet exercised with real OpenAI calls: an edit's stored `prompt`/`prompt_inputs`/`parent_image_id`, the masked-edit route wiring, and `compare_group_id` storage (verified by mocks and unit-style scripts only).
- No automated mask suggestions (§1).
- Economy mode not wired up for the Edit/Reference flow, and has no cancel-a-batch UI (§1, §5.5).
- Economy mode's ingestion path (`src/lib/batch-poll.ts`) has run end-to-end on real Sunburst batches (4 batches / 9 images on 2026-09-27–29, 0 failures; billed at exactly 50% — see `src/docs/gpt-image-2.5-pricing-reference.md`). The newer ingestion fields (`usage` → `actual_cost`, returned `size`, `compression`, `prompt_inputs`) haven't been through a live batch yet, but the output-line shape they read was confirmed from those real batches. Flare has never been sent through Batch.
- No test runner (browser verification with a mocked `window.fetch`, plus throwaway scratchpad scripts for `buildPrompt`, size tiers, pricing and mask compositing).
- Mobile/narrow-viewport layout has had one pass (mask editor overflow fix, gallery-primary mobile stacking) but hasn't been verified on a real narrow device/emulator this session — see PLAN.md §5.
