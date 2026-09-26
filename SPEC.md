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
- Gallery with prompt search, favorites, storage usage, delete
- Auth-gated (Clerk), deployed on Vercel

**Explicitly out of scope (deferred):**
- Tags/collections beyond prompt-text search
- Multi-user / team features, sharing, roles
- Batch generation (`n` > 1 per request)
- Automatic mask suggestions (e.g. segmentation)

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

Single table, `images` (Drizzle schema in `src/db/schema.ts`):

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
| `source_type` | text, not null | `"generate"` \| `"edit"` |
| `reference_image_ids` | jsonb string[], default `[]` | Gallery images used as references for an edit |
| `cost_estimate` | numeric(10,4), nullable | Estimated USD cost at generation time (see §6) |
| `created_at` | timestamptz, not null, default now | |

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
      generate/route.ts         POST — text-to-image, SSE streaming
      edit/route.ts              POST — image edit + mask, multipart form
      images/route.ts            GET — list images (search, favorites filter)
      images/[id]/route.ts       PATCH (favorite toggle) / DELETE
      storage-usage/route.ts     GET — total Blob bytes + count
  components/
    generate-panel.tsx          Prompt input, settings, tabs (Generate/Edit), submit
    mask-editor.tsx             Canvas-based inpainting mask painter (Dialog)
    gallery.tsx                 Grid, search, favorites filter, storage usage
    image-card.tsx              Per-image tile: favorite/download/delete/use-as-reference
    theme-provider.tsx / theme-toggle.tsx
    ui/                         shadcn/ui primitives (Base UI-backed)
  lib/
    openai.ts                   OpenAI client, model/size/quality constants
    pricing.ts                  Cost-estimate table (approximate, see §6)
    save-image.ts               Uploads to Blob + inserts DB row (shared by generate/edit)
    use-image-stream.ts         Client hook: SSE parsing for streaming generation
    sse.ts                      Server-side SSE event encoder
    reference-items.ts          Converts gallery images / disk files into edit-reference items
    types.ts                    Shared TS types (ImageRecord, stream events)
  db/
    schema.ts, index.ts         Drizzle schema + lazy DB client
  proxy.ts                      Clerk middleware — gates all routes except /sign-in, /sign-up
```

## 5. Core Flows

### 5.1 Generate (text-to-image)
1. User types a prompt, sets size/quality/format/background/model, clicks Generate.
2. Client (`useImageStream`) POSTs JSON to `/api/generate`.
3. Server calls `openai.images.generate({ ..., stream: true, partial_images: 2 })`, re-emits each partial as an SSE `partial` event.
4. On stream close, server uploads the final image to Blob, inserts a DB row, emits a `done` event with the full `ImageRecord`.
5. Client shows the live partial preview as the **top-left tile of the gallery grid** (not in the side panel) while generating, then swaps it for the real saved image.

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
- Search is server-side: `/api/images?q=&favorites=` does `ILIKE` on prompt + favorite filter, ordered by `created_at desc`, limit 200.
- Favorite toggle: `PATCH /api/images/:id`.
- Delete: `DELETE /api/images/:id` — deletes the DB row and the Blob object.
- Storage usage: `/api/storage-usage` lists all blobs under `images/` and sums size — polled on gallery mount and after each generation.

## 6. Cost Estimation

`src/lib/pricing.ts` provides a **rough, hardcoded estimate** shown as a badge on the Generate/Apply-edit button, keyed by quality × a size multiplier. OpenAI does not expose per-request pricing in the API, so these numbers are placeholders based on typical `gpt-image` tiers — not authoritative. If actual OpenAI billing drifts noticeably from what's shown, update the constants in that file; there's no live pricing API to source from.

## 7. Auth & Access Control

- Clerk (`clerkMiddleware` in `src/proxy.ts`) protects every route except `/sign-in(.*)` and `/sign-up(.*)` — "protected-first" pattern.
- No role/permission model — single account, full access once signed in.
- **Currently running on Clerk development keys** (usage-limited, shows a "Development mode" badge). Production keys require running Clerk's interactive domain-setup wizard (`clerk deploy`) by hand — not automatable from an agent session. This is a known gap, not yet closed.

## 8. Deployment

- Vercel project `image-generator` (team `dcatcherexgmailcoms-projects`), Git-connected to `github.com/dcatcherex/image_generator`. Pushes to `master` auto-deploy to Production.
- Env vars (Production/Preview/Development, set via `vercel env add`): `DATABASE_URL`(+`_UNPOOLED`), `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, plus Clerk's sign-in/up redirect URL vars.
- Local dev: `pnpm dev` (Turbopack — works fine under pnpm's strict `node_modules`; explicitly broke under npm's flat layout, hence the pnpm migration).
- `drizzle-kit push` against `DATABASE_URL_UNPOOLED` (direct connection; pooled connection doesn't support the session-level operations migrations need).

## 9. Known Gaps / Follow-ups

- Clerk still on development keys — needs the interactive production wizard (§7).
- Cost estimates are approximate, not sourced from a real pricing API (§6).
- No tags/collections, batch generation, or automated mask suggestions (§1).
- No tests (manual browser verification only, done ad hoc per feature).
- Mobile/narrow-viewport layout has not been deliberately tuned (desktop-first).
