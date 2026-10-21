# Image Studio — Brand Kits (Spec + Implementation Plan)

Handoff doc for a fresh session. Settled with the user in a grilling session on 2026-10-21. Inspired by DESIGN.md (designmd.ai/what-is-design-md): a plain-markdown design system that an AI reads as context. Here a brand kit becomes a prompt section plus a logo reference image.

**Motivating example:** the same Care Hub promo poster in two colourways (pink/mint vs brown/olive): identical layout and copy, different palette and logo. The user works for 3 brands and wants to generate social posts in a chosen brand, and to re-skin existing work into a brand.

**Read first:** `AGENTS.md` (this Next.js version differs from training data), `SPEC.md`, `ENHANCEMENTS.md` (ground rules apply here too: pnpm, `drizzle-kit push`, real generations cost money, mock `fetch` to verify UI, `pnpm lint` + `pnpm build` per phase, one commit per phase).

---

## Part 1 — Spec

### Decisions (all settled with the user)

| # | Area | Decision |
|---|---|---|
| 1 | Scope | v1 covers both **generate in a brand** and **re-skin an existing image into a brand**. |
| 2 | Brand contents | Name, colours (hex + role + usage note), type feel (described, since image models can't use real fonts), style/mood, do's & don'ts, **standing text** (contact info, app name, LINE ID), free-text notes, logo variants, text language. Example-post references are deferred (they cost input tokens every generation). |
| 3 | Storage/editing | Structured fields + free-text notes. **Import/Export as DESIGN.md** markdown. |
| 4 | Logo | Attached as a reference image with a new `logo` role ("reproduce exactly; do not alter shape or colours") so it can sit on uniforms, phone mockups, etc. Post-hoc `sharp` stamping is a possible later option. |
| 5 | Creating | Manual form, or DESIGN.md paste/import. Extract-from-image (needs a vision/text model) is deferred. |
| 6 | Selecting | Sticky **header brand switcher**: `All brands` / `None` / each brand / `Manage brands…`. Applies to generation and filters the gallery. Persisted in localStorage. |
| 7 | Visibility | **Owner-only.** Brand routes (including reads) call `requireOwner()`. Public viewers never see brand names, `brand_id`, or the switcher. |
| 8 | Per-generation toggles | Under the panel, the active brand shows chips: **Palette · Style · Logo · Standing text**. Defaults: palette + style on, logo + standing text off. Social presets set their own chip defaults. |
| 9 | Social posts | New generate presets by **layout type**, each with a fitting aspect: Promo/offer post, Announcement, Tips/carousel slide, Quote/testimonial, Event. Brand-saved custom presets come next (not v1). |
| 10 | Image ↔ brand | New nullable `images.brand_id`; a **snapshot** of the brand section is stored in `prompt_inputs.brand` so old images stay reproducible. |
| 11 | Refine | Uses the brand's **current** version (note in UI if it differs from the snapshot). If the image's brand ≠ the active brand, **warn**, don't silently switch. |
| 12 | Re-skin text | A per-run checkbox **"Replace contact info"** (default off): when on, the target brand's standing text replaces the source's; otherwise all text is preserved exactly. |
| 13 | Reassign | Image card menu can set brand (incl. None), like tags. |
| 14 | Delete | **Archive** (hidden from the switcher, images keep `brand_id`). Separate **Delete permanently** sets those images' `brand_id` to null; snapshots in `prompt_inputs` remain. |
| 15 | Logo variants | Up to 3 named variants (`primary`, `on-dark`, `icon`); pick **one** per generation. |
| 16 | Batch | Batch (Economy) honours the active brand and toggles via the same `PromptInputs` path. One brand per batch. |
| 17 | Language | Per-brand `language` (default **Thai**). Adds "All text in Thai, correct spelling and tone marks, in the brand's type feel"; social preset placeholders follow it. |
| 18 | Gallery filter | Active brand → only that brand's images. `All brands` → everything; `None` → unbranded. |

### Data model

```ts
// src/db/schema.ts
export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // { colors: {hex, role, note?}[], typeFeel, style, dos: string[], donts: string[],
  //   standingText, notes } — jsonb so fields can evolve without migrations.
  kit: jsonb("kit").$type<BrandKit>().notNull(),
  language: text("language").notNull().default("Thai"),
  // { variant: "primary" | "on-dark" | "icon", blobUrl, blobPathname }[]
  logos: jsonb("logos").$type<BrandLogo[]>().notNull().default([]),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: ..., updatedAt: ...,
});

// images: add
brandId: uuid("brand_id"), // not a FK: permanent delete nulls it explicitly
```

`PromptInputs` gains:

```ts
brand?: {
  id: string;
  name: string;
  section: BrandSnapshot;          // the resolved fields actually used
  include: { palette: boolean; style: boolean; logo: boolean; standingText: boolean };
  logoVariant?: BrandLogo["variant"];
};
```

The server resolves the brand from `brandId` (never trusts client-sent kit content), builds the snapshot, and validates `include` in `sanitizePromptInputs()`.

### Prompt assembly (`buildPrompt()`)

Order: `Inputs` (reference roles, now incl. `logo`) → **`Brand`** → user `base` → `Change only` → `Constraints` → `Text`.

```
Brand: <name>
- Palette: primary #1F8A5B (headlines, buttons); accent #E94B7B (highlights, price); neutral #FFF7F2 (backgrounds)
- Style: <style/mood>
- Typography feel: <type feel>
- Do: …  Don't: …
- All text in Thai, with correct spelling and tone marks.
```

- Lines appear only for enabled chips (do's & don'ts follow Style; language is always on when a brand is active).
- Standing text (chip on) is appended to the verbatim `Text` section, not the Brand section.
- Logo (chip on): the chosen variant is appended to the reference list with role `logo`. This forces the edit endpoint; the cost estimate must include the extra input image.
- No brand → output identical to today.

### Re-skin

An edit preset "Re-skin to brand" (requires an active brand): source image = `subject`, logo = `logo`, preserve `layout` + `text` (+ `identity` if people are present; user-toggleable as today), palette + style + logo chips forced on. Scaffold: "Restyle this design into the brand below: swap colours to the brand palette and replace the logo with Image N. Keep layout, imagery and copy unchanged." With **Replace contact info** on: drop `text` from preserve and add the target standing text with an explicit replacement instruction.

### API

- `GET/POST /api/brands`, `PATCH/DELETE /api/brands/[id]` (`DELETE?permanent=true` for hard delete; `GET ?archived=true` includes archived), `POST /api/brands/[id]/logos` (Blob upload). All `requireOwner()`.
- `GET /api/brands/[id]/design-md` export; import = `POST /api/brands` with `{ markdown }`, parsed best-effort into fields (unparsed content goes to `notes`). The dialog parses/serialises client-side with the same `src/lib/brand-design-md.ts` so imports can be reviewed before saving.
- `/api/generate`, `/api/edit`, `/api/batch`: accept `brandId` + `include` + `logoVariant`; set `images.brand_id`.
- `GET /api/images?brand=<id|none>` filter: only honoured for the owner. Strip `brandId` / `prompt_inputs.brand` from responses for non-owners.
- `PATCH /api/images/[id]` accepts `brandId` (owner-only, already guarded).

### UI

- Header `BrandSwitcher` (owner only), with colour dot + name.
- `BrandsDialog` (styled like `settings-dialog.tsx`): list + archive; form with swatches/hex inputs, type feel, style, do's/don'ts, standing text, language, logo variant uploads; Import / Export DESIGN.md.
- Generate panel: brand chip row + logo-variant select; re-skin "Replace contact info" checkbox.
- Image card / lightbox: brand badge + "Set brand" menu (owner only); refine warning per decision 11.
- Help dialog: new "Brands" section.

---

## Part 2 — Implementation plan

1. **Data + API.** `brands` table, `images.brand_id`, brand CRUD + logo upload + archive/permanent delete, owner guards, non-owner response stripping. Verify with curl.
2. **Manage UI.** Header switcher (localStorage), `BrandsDialog` form, DESIGN.md import/export.
3. **Prompt integration.** `PromptInputs.brand`, `logo` reference role, `buildPrompt()` Brand section, server-side brand resolution in generate/edit/batch, cost estimate incl. logo. Unit-check prompt output for each chip combination; one real `low`-quality call with logo on.
4. **Generate panel + social presets.** Chip row, logo variant select, 5 social layout presets with chip defaults and the brand language.
5. **Re-skin + gallery.** Re-skin preset + "Replace contact info", gallery brand filter, card "Set brand", refine warning, Help section.
