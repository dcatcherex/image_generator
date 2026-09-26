# Image Studio — Implementation Plan / Handoff

This is a handoff doc for continuing work on this project in a fresh chat session. Read `SPEC.md` first for full context (architecture, data model, flows) — this doc is only the **outstanding work**, broken into discrete, independently-startable tasks.

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

### 1. Close the Clerk production-keys gap

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

---

### 2. Verify/correct the cost-estimate numbers

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

### 4. Batch generation (n > 1)

**Why it matters**: currently every generation produces exactly one image; seeing a few variations at once is a common workflow.

**Steps**:
1. Add an `n` control to `generate-panel.tsx` settings (e.g. 1/2/4, matching OpenAI's supported range).
2. `/api/generate`: pass `n` through to `openai.images.generate()`. **Note**: streaming (`partial_images`) semantics with `n > 1` need checking against current OpenAI docs — verify how partial-image events are indexed across multiple concurrent images before assuming the existing SSE handling (`src/lib/use-image-stream.ts`, keyed on a single `partialB64`) still works. It likely needs to become an array/map keyed by image index.
3. Gallery placeholder logic (`gallery.tsx`) currently renders one "Rendering..." tile — extend to render `n` tiles.
4. Cost badge (`pricing.ts` usage in `generate-panel.tsx`) should multiply by `n`.

**Acceptance criteria**: setting n=4 produces 4 distinct images from one submit, each streaming its own live preview, each saved as a separate DB row.

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

## Gotchas learned this session (read before touching related code)

- **npm optional-dependencies bug on Windows**: broke native binaries (`lightningcss`, `@tailwindcss/oxide`) under Turbopack. Fixed by migrating the whole project to **pnpm** — don't switch back to npm.
- **Turbopack + npm's flat `node_modules`** was the actual root cause of an earlier CSS build failure, not Turbopack itself — pnpm's strict `node_modules` layout resolves it, confirmed by testing.
- **shadcn `DialogContent` default is `sm:max-w-sm` (384px)** — a plain `className="max-w-fit"` override loses to it at desktop widths because Tailwind's breakpoint-prefixed rule wins. Override the `sm:` variant explicitly (`sm:max-w-fit`) when you need a dialog to size to its content.
- **Base UI `Dialog` unmounts content on close** (confirmed via the mask-persistence bug) — don't assume child component state survives a close/reopen cycle. Either lift the state to a parent that stays mounted, or explicitly restore it on reopen (see `mask-editor.tsx`'s `initialMask` prop pattern).
- **Ref callbacks defined inline (a new function every render) cause React to detach/reattach on every render** — if the ref callback does anything with side effects (like our canvas init), this causes an infinite loop (`Maximum update depth exceeded`). Always wrap ref callbacks in `useCallback`.
- **`<img onLoad>` doesn't fire for already-cached images** — several gallery images share blob URLs across components, so `onLoad` alone is unreliable; check `img.complete` in a ref callback as a fallback (see `mask-editor.tsx`'s `attachImgRef`).
- **OpenAI dev-mode Clerk + a non-localhost domain**: `curl` against the deployed app can return a misleading 404 with `X-Clerk-Auth-Reason: dev-browser-missing` — that's Clerk's dev-instance cross-domain handshake needing real browser JS, not a real bug. Verify with an actual browser, not curl, when debugging Clerk-gated routes on preview/production URLs.
- **Real API costs**: `/api/generate` and `/api/edit` call the live OpenAI API — no sandbox/test mode exists for this endpoint. When testing UI behavior only, mock `window.fetch` in the browser console/tool rather than submitting real prompts.
