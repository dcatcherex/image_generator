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
- "Economy mode" — real OpenAI Batch API submission for ~50% cheaper, async (up to 24h) generation, as a separate opt-in path (see §5.5)
- Auth-gated (Clerk), deployed on Vercel

**Explicitly out of scope (deferred):**
- Freeform tags/collections (a fixed 6-value tag list is implemented instead — see §3)
- Multi-user / team features, sharing, roles
- Automatic mask suggestions (e.g. segmentation)
- Economy mode for the Edit/Reference flow (Generate only, for now)
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
| Hosting | Vercel | Git-connected; pushes to `master` auto-deploy to production |

## 3. Data Model

Two tables (Drizzle schema in `src/db/schema.ts`):

### `images`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | `defaultRandom()` |
| `prompt` | text, not null | User's prompt |
| `revised_prompt` | text, nullable | OpenAI's rewritten prompt, if any |
| `model` | text, not null | e.g. `gpt-image-2.5-flare` |
| `size` | text, not null | e.g. `1024x1024` |
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
| `requests` | jsonb, not null, default `[]` | Array of `{customId, prompt, size, quality, format, background, model, tag}` — one entry per submitted `.jsonl` line, used to correlate OpenAI's `custom_id`-keyed results back to original params at ingestion time |
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
      images/[id]/route.ts       PATCH (favorite toggle, tag set) / DELETE
      storage-usage/route.ts     GET — total Blob bytes + count
      batch/generate/route.ts    POST — submit an Economy-mode batch job to OpenAI's Batch API
      batch/route.ts             GET — list non-terminal batch_jobs (for gallery pending tiles)
      batch/poll/route.ts        POST — client-triggered check-and-ingest (Clerk-protected)
      batch/cron/route.ts        GET — Vercel Cron target, check-and-ingest (CRON_SECRET-protected, public route)
  components/
    generate-panel.tsx          Prompt input, settings, tabs (Generate/Edit), Economy mode toggle, submit
    mask-editor.tsx             Canvas-based inpainting mask painter (Dialog)
    gallery.tsx                 Grid, search, favorites/tag filters, storage usage, pending-batch tiles
    image-card.tsx              Per-image tile: favorite/tag/download/delete/use-as-reference
    theme-provider.tsx / theme-toggle.tsx
    ui/                         shadcn/ui primitives (Base UI-backed)
  lib/
    openai.ts                   OpenAI client, model/size/quality/n constants
    pricing.ts                  Real per-image cost table (low/medium/high) + extrapolated xhigh/max, THB formatter (see §6)
    tags.ts                     Fixed assignable-tag list + "All" filter sentinel
    batch.ts                    Economy-mode types, .jsonl builder, batch-output-line parser
    batch-poll.ts                checkAndIngestPendingBatches() — shared by the poll and cron routes
    save-image.ts               Uploads to Blob + inserts DB row (shared by generate/edit/batch-ingestion)
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
1. User types a prompt, sets size/quality/format/background/model/tag/n (1/2/4), clicks Generate.
2. Client (`useImageStream`) POSTs JSON to `/api/generate`.
3. If `n === 1`: server calls `openai.images.generate({ ..., stream: true, partial_images: 2 })`, re-emits each partial as an SSE `partial` event, then on stream close uploads the final image to Blob, inserts a DB row, emits a `done` event with the full `ImageRecord`. Client shows the live partial preview as the **top-left tile of the gallery grid** (not in the side panel) while generating, then swaps it for the real saved image.
4. If `n > 1`: server calls `openai.images.generate({ ..., n, stream: false })` (no live preview — OpenAI's streaming events don't disambiguate which image-of-a-batch a partial belongs to), then emits one synthetic `done` event per image as each is persisted, so the gallery fills in tiles progressively. Gallery shows `n` pulsing placeholder tiles that count down as each `done` arrives.

### 5.2 Edit (image-to-image)
1. User switches to "Edit / Reference" tab, adds 1+ reference images (upload from disk, or "Use as reference" on any gallery tile).
2. Optionally opens the mask editor (only offered when exactly one reference image is present — masks apply to a single base image).
3. Submits: client POSTs `multipart/form-data` to `/api/edit` (prompt, settings, reference image files, optional mask file).
4. Server calls `openai.images.edit({ image, mask?, ... })` (non-streaming), saves result the same way as generate.

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
4. While anything is pending, the client polls `POST /api/batch/poll` every 45s (responsiveness while a tab is open); a **Vercel Cron** hitting `GET /api/batch/cron` once a day (00:00 UTC) is the reliability backstop that keeps working even when nobody has the app open.
5. Both poll routes call the same `checkAndIngestPendingBatches()` (`src/lib/batch-poll.ts`): retrieves the batch from OpenAI, updates status/counts, and — the first time it sees `status: "completed"` — fetches the output file, parses each line (correlating by `custom_id`, **not** line order, per OpenAI's own docs warning that output order isn't guaranteed), looks up the original request params, and calls the same `persistGeneratedImage()` the instant flow uses. The row then flips to our own `"ingested"` status so it's never re-processed. Once ingested, the resulting images just show up in the normal `/api/images` list and the placeholder tiles for that job naturally disappear (the job drops out of the non-terminal `GET /api/batch` list).

## 6. Cost Estimation

`src/lib/pricing.ts` provides a `[quality][size]` lookup table shown as a badge (in THB, via `formatCostThb()`) on the Generate/Apply-edit/Submit-batch button. `low`/`medium`/`high` rows are sourced from OpenAI's published GPT Image 2 per-image pricing (the closest real numbers available — GPT Image 2.5, which this app actually uses, is priced token-based with no published per-image dollar figures). `xhigh`/`max` are extrapolated guesses (clearly commented as such in the file, not sourced) since those tiers have no published numbers for either model. `auto` quality falls back to the `medium` row. Economy mode multiplies the result by 0.5 (OpenAI's real Batch API discount). If actual OpenAI billing drifts noticeably from what's shown, update the constants in that file.

## 7. Auth & Access Control

- Clerk (`clerkMiddleware` in `src/proxy.ts`) protects every route except `/sign-in(.*)`, `/sign-up(.*)`, and `/api/batch/cron(.*)` — "protected-first" pattern. The cron route is the one deliberate exception: Vercel's cron invocation carries no Clerk session, so it authenticates itself via a `CRON_SECRET` bearer token instead (checked inside the route handler, fails closed with 500 if `CRON_SECRET` isn't set).
- No role/permission model — single account, full access once signed in.
- **Staying on Clerk development keys for now, by user decision** (usage-limited, shows a "Development mode" badge). Production keys would require running Clerk's interactive domain-setup wizard (`clerk deploy`) by hand — not automatable from an agent session. Revisit if/when usage limits become a problem.

## 8. Deployment

- Vercel project `image-generator` (team `dcatcherexgmailcoms-projects`), Git-connected to `github.com/dcatcherex/image_generator`. Pushes to `master` auto-deploy to Production.
- Env vars (Production/Preview/Development, set via `vercel env add`): `DATABASE_URL`(+`_UNPOOLED`), `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, plus Clerk's sign-in/up redirect URL vars. **`CRON_SECRET` still needs to be added manually** (see §7, PLAN.md §10) — Economy mode's cron backstop won't authenticate without it.
- `vercel.json` configures a Vercel Cron job hitting `/api/batch/cron` once a day (00:00 UTC). The Hobby plan only allows daily crons and **rejects deployments** with a more frequent schedule; on Pro+ this can go back to `*/15 * * * *`.
- Local dev: `pnpm dev` (Turbopack — works fine under pnpm's strict `node_modules`; explicitly broke under npm's flat layout, hence the pnpm migration).
- `drizzle-kit push` against `DATABASE_URL_UNPOOLED` (direct connection; pooled connection doesn't support the session-level operations migrations need). Run via `pnpm exec dotenv -e .env.local -- pnpm exec drizzle-kit push` since the CLI doesn't auto-load `.env.local`.

## 9. Known Gaps / Follow-ups

- Clerk still on development keys — by user decision, not currently planned (§7).
- Cost estimates for `xhigh`/`max` quality tiers are extrapolated guesses, not sourced (§6); low/medium/high are real published numbers as of this session.
- No automated mask suggestions (§1).
- Economy mode not wired up for the Edit/Reference flow, and has no cancel-a-batch UI (§1, §5.5).
- Economy mode's ingestion path (`src/lib/batch-poll.ts`) has been verified by code review against the OpenAI SDK's TypeScript definitions, but **not by a real batch actually completing end-to-end** — that takes real time and money and wasn't exercised live. Sanity-test with one small real batch before relying on it.
- `CRON_SECRET` env var not yet set on Vercel — Economy mode's cron backstop currently fails closed (500) until this is added.
- No tests (manual browser verification only, done ad hoc per feature).
- Mobile/narrow-viewport layout has had one pass (mask editor overflow fix, gallery-primary mobile stacking) but hasn't been verified on a real narrow device/emulator this session — see PLAN.md §5.
