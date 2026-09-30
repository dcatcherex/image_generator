# Image Studio — Implementation Plan / Handoff

This is a handoff doc for continuing work on this project in a fresh chat session. Read `SPEC.md` first for full context (architecture, data model, flows) — this doc is only the **outstanding work**, broken into discrete, independently-startable tasks.

> **GPT Image 2.5 enhancements — DONE** (phases 0–12 of `ENHANCEMENTS.md`, one commit per phase on `master`): actual cost/latency tracking with calibrated estimates, optional live preview, size tiers, transparency guard + compression, model comparison, reference roles, change-only/preserve, Refine + versions, mask compositing, presets and exact text. `SPEC.md` reflects the result; open verification items are listed in its §9. This supersedes task 2 below.

**Live**: https://image-generator-ruddy-one.vercel.app
**Repo**: https://github.com/dcatcherex/image_generator (branch `master`, auto-deploys to Vercel production on push)

## Before you start

```bash
cd "D:/ai/tools/image generator"
git status                    # confirm clean tree, no stray local changes
pnpm install                  # pnpm only — npm has a known optional-deps bug on this Windows box, see "Gotchas" below
pnpm dev                      # Turbopack dev server, usually picks port 3001 (3000 is occupied by something else on this machine)
```

Env vars live in `.env.local` (gitignored) and are already provisioned — `DATABASE_URL`(+`_UNPOOLED`), `BLOB_READ_WRITE_TOKEN`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, plus Clerk redirect URL vars. `OPENAI_API_KEY` is **not** in `.env.local` — it's set as a system environment variable on this machine and Next.js picks it up from there (don't overwrite it).

Before testing anything that calls `/api/generate` or `/api/edit` for real, remember: **that costs real OpenAI credits.** Prefer mocking `window.fetch` in the browser for UI-only testing (see task 3 for a worked example) over triggering real generations.

## Task priority order

Do these roughly in order — later tasks assume auth/deploy is solid, but each has its own acceptance criteria and can be picked up independently if priorities change.

---

### 1. Close the Clerk production-keys gap — RESOLVED/DEFERRED

**User decided to stay on Clerk development keys for now — revisit later if usage limits become a problem.** No code change made; do not touch Clerk config unless the user brings this back up.

<details>
<summary>Original task text (kept for reference if this is revisited)</summary>

**Why it matters**: the app is publicly deployed but still running Clerk *development* keys, which have strict usage limits and print a "Development mode" badge on the sign-in page. Not production-safe long-term.

**What's blocking full automation**: `clerk deploy` is an *interactive* wizard (asks for a custom domain, DNS records, OAuth credential setup) — it cannot be driven from an agent's non-interactive shell. `clerk deploy --mode agent` is read-only and just reports status.

**Steps**:
1. Ask the user whether they have a custom domain to attach, or want to proceed without one (Clerk requires *some* production domain setup even without a custom domain — check current `clerk-cli`/`clerk-setup` skill docs for the no-custom-domain path, since this may have changed).
2. Ask the user to run `clerk deploy` themselves in a terminal (not through the agent) and follow the prompts.
3. Once they report it's done, run `clerk deploy status --mode agent` to verify (use `--wait` if it's still propagating).
4. Pull the new production keys (`clerk env pull` or the dashboard) and update Vercel's env vars for the Production environment via `vercel env add ... production --sensitive` (see how Clerk dev keys were added originally — same pattern).
5. Redeploy (`vercel --prod` or just push to `master`).
6. Verify the "Development mode" badge is gone on the live sign-in page.

**Acceptance criteria**: live sign-in page shows no dev-mode badge; `clerk doctor` reports a healthy production instance.

</details>

---

### 2. Verify/correct the cost-estimate numbers — SUPERSEDED

**Done via `ENHANCEMENTS.md`**: `pricing.ts` now uses the official 2.5 token table, records actual cost from `usage`, and calibrates from real rows. The text below is the original (obsolete) task.

**Why it matters**: `src/lib/pricing.ts` has placeholder numbers (not sourced from a real OpenAI pricing API — none exists for this). They're shown to the user as a cost badge before every generation.

**Steps**:
1. Ask the user to check their actual OpenAI billing/usage dashboard after a few real generations at known quality/size combos.
2. Compare against what `estimateCost()` predicted for those same combos.
3. Adjust `QUALITY_COST_ESTIMATE` and `SIZE_MULTIPLIER` in `src/lib/pricing.ts` to match reality.

**Acceptance criteria**: estimates are within a reasonable margin (~20%) of real billed cost across at least 2-3 quality tiers.

---

### 3. Tags / collections

**Why it matters**: deferred from the original build — currently the only organization is prompt-text search + favorites.

**Scope decision needed**: ask the user what they actually want now that they've used the tool — freeform tags, or fixed collections/albums? Don't assume; this was explicitly deferred pending real usage patterns.

**Rough approach** (once scope is confirmed):
1. Add a `tags` column to the `images` table (`text[]` or a join table if tags need their own metadata) — migrate via `drizzle-kit push` against `DATABASE_URL_UNPOOLED`.
2. Add tag input UI to `image-card.tsx` or a dedicated edit-tags dialog.
3. Extend `/api/images` GET to filter by tag (`?tag=`).
4. Add a tag-filter chip row to `gallery.tsx` alongside the existing favorites toggle.

**Acceptance criteria**: user can add/remove tags on an image and filter the gallery by tag.

---

### 4. Batch generation (n > 1) — DONE

**Not to be confused with "Economy mode" (§10 below)** — this task is the `n` selector that sends multiple images in one synchronous request at full price. The real OpenAI Batch API (async, ~50% cheaper) is a separate, later addition — see §10.

**Why it matters**: currently every generation produces exactly one image; seeing a few variations at once is a common workflow.

**Steps**:
1. Add an `n` control to `generate-panel.tsx` settings (e.g. 1/2/4, matching OpenAI's supported range).
2. `/api/generate`: pass `n` through to `openai.images.generate()`. **Note**: streaming (`partial_images`) semantics with `n > 1` need checking against current OpenAI docs — verify how partial-image events are indexed across multiple concurrent images before assuming the existing SSE handling (`src/lib/use-image-stream.ts`, keyed on a single `partialB64`) still works. It likely needs to become an array/map keyed by image index.
3. Gallery placeholder logic (`gallery.tsx`) currently renders one "Rendering..." tile — extend to render `n` tiles.
4. Cost badge (`pricing.ts` usage in `generate-panel.tsx`) should multiply by `n`.

**Acceptance criteria**: setting n=4 produces 4 distinct images from one submit, each saved as a separate DB row. **Implementation note**: n=1 keeps live streaming/partial-preview exactly as before; n>1 uses a non-streaming call and emits one synthetic "done" SSE event per image as it's persisted (see `src/app/api/generate/route.ts`) — OpenAI's streaming events have no documented field disambiguating which image-of-a-batch a partial belongs to when n>1, so streaming was deliberately not attempted for the batch case rather than guessing.

---

### 5. Mobile / narrow-viewport pass

**Why it matters**: built and tested desktop-first; narrow viewports haven't been deliberately verified since the panel-repositioning and prompt-fill-height changes.

**Steps**:
1. Use the browser tool's `resize_window` (or real device testing) to check the app at ~375-420px width.
2. Check: does the generate panel / gallery stacking (`page.tsx`, `flex-col lg:flex-row-reverse`) make sense on mobile? Right now the panel is `max-h-[70vh]` on mobile which may be awkward — reconsider whether mobile should default to the gallery being primary and the panel collapsed/sheet-based instead.
3. Check the mask editor dialog (`mask-editor.tsx`, `MAX_DISPLAY = 480`) on small screens — verify it doesn't overflow.

**Acceptance criteria**: no horizontal scroll, no clipped controls, mask editor and generate panel both usable at 375px width.

---

### 6. Tests

**Why it matters**: everything so far has been verified via manual browser testing (screenshots, live clicks) in-session. No automated regression coverage.

**Scope decision needed**: ask the user how much test investment they want for a personal tool — this could be skipped entirely, or scoped to just the trickiest logic (SSE parsing in `use-image-stream.ts`, mask canvas math in `mask-editor.tsx`).

**If pursued**: this project doesn't have a test runner configured yet (no Vitest/Jest/Playwright in `package.json`). Start with picking one and wiring it up before writing tests.

---

### 10. "Economy mode" — real OpenAI Batch API — DONE

**What this is**: a separate, opt-in path alongside the normal instant-generate flow (including the n=1/2/4 selector from §4, which stays untouched as the default). Submits via OpenAI's actual async Batch API — upload a `.jsonl`, OpenAI processes within up to 24h (often faster, no guarantee), costs ~50% less. Toggle lives in `generate-panel.tsx` next to Model/n ("Economy mode" switch, only shown in Generate mode — not wired up for Edit).

**New pieces**:
- **DB**: new `batch_jobs` table (`src/db/schema.ts`) — separate from `images` since a batch job has its own lifecycle spanning multiple not-yet-existing images. Status mirrors OpenAI's (`validating|in_progress|finalizing|completed|expired|cancelling|cancelled|failed`) plus our own `ingested` once we've turned a completed batch's output into real `images` rows (guards against double-persisting on repeat polls).
- **Routes**:
  - `POST /api/batch/generate` — submits a new batch (builds `.jsonl`, uploads via `openai.files.create`, creates via `openai.batches.create`, inserts a `batch_jobs` row).
  - `GET /api/batch` — lists non-terminal `batch_jobs` rows (public read, used by the gallery to render "Pending — up to 24h" placeholder tiles).
  - `POST /api/batch/poll` — client-triggered convenience poll (owner-only); calls the shared `checkAndIngestPendingBatches()` in `src/lib/batch-poll.ts`.
  - `GET /api/batch/cron` — the reliability backstop, hit every 15 min by a Cloudflare Worker cron (see below) and daily at 00:00 UTC by Vercel Cron (`vercel.json`). **Deliberately excluded from Clerk auth** in `src/proxy.ts` (cron invocations carry no Clerk session) — instead checks `Authorization: Bearer $CRON_SECRET` itself and fails closed (500) if `CRON_SECRET` isn't set.
- **Ingestion logic** (`src/lib/batch-poll.ts`): when a batch flips to `completed`, fetches the output file, parses each line's `custom_id` (results are **not** guaranteed to be in the same order as submitted — always correlate by `custom_id`, never position), looks up the original params from the `requests` jsonb column, and calls the same `persistGeneratedImage()` the instant flow uses. Partial failures (some lines succeed, some don't) are handled gracefully — failed `custom_id`s are logged and skipped, not treated as a fatal error for the whole batch.
- **Gallery**: `page.tsx` fetches `GET /api/batch` on mount and polls `POST /api/batch/poll` every 45s while anything is pending, so placeholder tiles **survive a page reload** (unlike the existing live-stream "Rendering..." tiles, which only exist in client memory during an active SSE connection) — this is the whole reason batch jobs get their own DB table instead of being client-only state.

**Cron setup (done)**: `CRON_SECRET` is set on the Vercel project (add it to `.env.local` too if you ever want to test the cron route locally). Without it, `/api/batch/cron` returns 500 "CRON_SECRET not configured" (fails closed — intentional). Two callers send `Authorization: Bearer $CRON_SECRET`:
- **Cloudflare Worker `image-generator-cron`** (Cloudflare dashboard, not in this repo) — primary, Cron Trigger `*/15 * * * *`, same `CRON_SECRET` stored as a Worker secret. Its `scheduled()` handler just `fetch`es `https://image-generator-ruddy-one.vercel.app/api/batch/cron` with the header and logs the response (Worker → Observability). Verified with a manual "Trigger scheduled event": `200 {"checked":0,"ingested":0}`. If `CRON_SECRET` is rotated, update it in both Vercel and the Worker.
- **Vercel Cron** (`vercel.json`) — daily fallback. Vercel sends the header automatically once the env var exists.

**Ambiguities resolved conservatively** (per the coordinator's "make the simpler choice and note it" guidance — revisit if they don't fit real usage):
- Cron schedule: the project is on Vercel's Hobby plan, which **rejects deployments** whose crons run more than once a day (this blocked every deploy while `vercel.json` had `*/15`). So `vercel.json` runs daily and the 15-min cadence comes from the Cloudflare Worker instead. On Pro+, `vercel.json` could go back to `*/15 * * * *` and the Worker could be retired.
- The batch submit form's `n` (copy count) reuses the exact same 1/2/4 options and cap as the instant-generate `N_OPTIONS` (`src/lib/openai.ts`), for consistency — not a hard OpenAI limit (Batch API supports far more per file).
- Economy mode is Generate-only, not wired up for the Edit/Reference tab — OpenAI's Batch API does support `/v1/images/edits` too, but the request said "the same shape of params the normal generate form does," so Edit was left out of scope rather than assumed.
- No cancel-a-pending-batch UI was built (OpenAI's `openai.batches.cancel()` exists and would be easy to wire up if wanted).

**Verification status**: lint/build clean; UI (toggle, cost-badge discount, submit flow, pending-tile rendering/countdown, toast) verified live with `window.fetch` mocked — no real OpenAI Batch API calls were made this session (that costs real money and the real turnaround is up to 24h, impractical to verify live). The ingestion logic (`checkAndIngestPendingBatches` in `src/lib/batch-poll.ts`) and the request/response shapes it assumes were verified by careful reading of the `openai` npm package's own TypeScript definitions (`node_modules/openai/resources/batches.d.ts`, `files.d.ts`, `images.d.ts`) rather than by a live end-to-end run — **a real batch completing and getting correctly ingested has not been observed**, only code-reviewed against the SDK's documented types. Sanity-test with a real (small, cheap) batch before relying on this.

---

## Gotchas learned this session (read before touching related code)

- **npm optional-dependencies bug on Windows**: broke native binaries (`lightningcss`, `@tailwindcss/oxide`) under Turbopack. Fixed by migrating the whole project to **pnpm** — don't switch back to npm.
- **Turbopack + npm's flat `node_modules`** was the actual root cause of an earlier CSS build failure, not Turbopack itself — pnpm's strict `node_modules` layout resolves it, confirmed by testing.
- **shadcn `DialogContent` default is `sm:max-w-sm` (384px)** — a plain `className="max-w-fit"` override loses to it at desktop widths because Tailwind's breakpoint-prefixed rule wins. Override the `sm:` variant explicitly (`sm:max-w-fit`) when you need a dialog to size to its content.
- **Base UI `Dialog` unmounts content on close** (confirmed via the mask-persistence bug) — don't assume child component state survives a close/reopen cycle. Either lift the state to a parent that stays mounted, or explicitly restore it on reopen (see `mask-editor.tsx`'s `initialMask` prop pattern).
- **Ref callbacks defined inline (a new function every render) cause React to detach/reattach on every render** — if the ref callback does anything with side effects (like our canvas init), this causes an infinite loop (`Maximum update depth exceeded`). Always wrap ref callbacks in `useCallback`.
- **`<img onLoad>` doesn't fire for already-cached images** — several gallery images share blob URLs across components, so `onLoad` alone is unreliable; check `img.complete` in a ref callback as a fallback (see `mask-editor.tsx`'s `attachImgRef`).
- **OpenAI dev-mode Clerk + a non-localhost domain**: `curl` against the deployed app can return a misleading 404 with `X-Clerk-Auth-Reason: dev-browser-missing` — that's Clerk's dev-instance cross-domain handshake needing real browser JS, not a real bug. Verify with an actual browser, not curl, when debugging Clerk-gated routes on preview/production URLs.
- **Base UI `Select`**: `SelectValue` renders the raw value (use the label as the value when it must be readable), and `value={null}` gives an always-unselected control (used by the Presets dropdown).
- **sharp single-channel output**: `.raw()` on a blurred 1-channel image comes back as 3-channel sRGB; call `.extractChannel(0)` (see `mask-composite.ts`).
- **Panel visibility is user-persisted** (`panel-options-visibility` in localStorage) — an app can look like it is "missing" size/quality/format controls when they were simply hidden in Settings. Back up and restore it when testing.
- **Streamed `usage` includes preview frames** (196 vs 273 output tokens at `low` 1024² without/with 2 partials), so `actual_cost` on preview-on rows is already complete.
- **Real API costs**: `/api/generate` and `/api/edit` call the live OpenAI API — no sandbox/test mode exists for this endpoint. When testing UI behavior only, mock `window.fetch` in the browser console/tool rather than submitting real prompts.
