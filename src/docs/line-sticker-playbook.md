# LINE sticker playbook

How to make a LINE sticker set with this app, from character idea to files ready to upload to LINE Creators Market.

> **Before anything else:** use an **original character**. LINE's review guideline rejects images that infringe copyrights (5.1), "make use of copyrights that lack a clear owner, such as fan fiction" (5.2), or use material without proven permission (5.4). Anime, game, brand and celebrity characters are out. Fan-art prompts are fine for practice, not for submission.

---

## Quick checklist

Use this when you only need a reminder.

- [ ] **1. Character sheet:** Presets → *Character sheet* · Background **transparent** · Model **Sunburst** → save the best result
- [ ] **2. Sticker sheets:** load the character sheet as a reference image → Presets → *LINE sticker sheet* · Model **Sunburst** → fill in 8 poses + captions → generate
- [ ] **3. Check each sheet:** same character in all 8 · captions spelled right · background really transparent · stickers not touching
- [ ] **4. Split:** `pnpm stickers:split sheet1.png out\my-set`, then `pnpm stickers:split sheet2.png out\my-set --start 9` …
- [ ] **5. Check the files:** count = 8 / 16 / 24 / 32 / 40 · each looks right on its own · `main.png` and `tab.png` exist
- [ ] **6. Upload** to LINE Creators Market

---

## Step 1: Make the character reference sheet

This sheet is the "source of truth" for your character. Every sticker sheet copies from it, so spend time getting it right.

**App settings**

| Field | Value |
|---|---|
| Presets | *Character sheet* (fills in the prompt and sets 3:2, quality high) |
| Background | **transparent** (change it after picking the preset) |
| Format | PNG |
| Model | GPT Image 2.6 **Sunburst** |

**Prompt.** Replace the preset text with this, then fill in the `[...]`:

```text
Create a character reference sheet for an original sticker mascot.

Character:
[e.g. a tiny ghost-girl with a huge messy black bob haircut, one red hair clip, oversized white hoodie, sharp little fang]
Keep only the most essential identity traits: hairstyle silhouette, primary color, signature accessory, species traits.

Style:
Adorably quirky, askew, whimsical 2D hand-drawn IP character. Deliberately imperfect childlike drawing with graffiti-style graphic language. Exaggerated big head and tiny body (about 1:1 head-to-body). Facial features slightly misaligned. Loose, wobbly, tremulous hand-drawn black outlines. Local shapes slightly skewed, stretched or flattened, so it looks "strange yet cute".
Color: extract 3 colors from the character's primary color, secondary color and signature accessory, plus black line and white. Flat matte color blocks with slightly off-register, hand-painted fills that spill a little past the lines.

Layout:
Show the same character 3 times in a row: front view neutral, 3/4 view smiling, back view. Full body visible, feet included, generous spacing between poses.
Below them, a small row of 3 flat color swatches.

Constraints:
- Fully transparent background, no backdrop, no checkerboard, no scenery
- No text, no logos, no watermarks
- Consistent proportions across all three poses
```

**Tips**
- Generate a few versions and keep the one you like best. Changing the character later means redoing every sheet.
- If the three poses don't match each other, regenerate. Don't continue with a mismatched sheet.

---

## Step 2: Generate the sticker sheets

Each sheet gives **8 stickers**. Make as many sheets as your set needs (2 sheets = 16 stickers, 5 sheets = 40).

**App settings**

1. Add the character sheet from Step 1 under **Reference images**. The Presets menu switches to *Edit presets…*.
2. Presets → **LINE sticker sheet**. This sets:

| Field | Value set by the preset |
|---|---|
| Size | 16:9 |
| Size tier | 2K (2560 × 1440 px) |
| Quality | high |
| Background | transparent |
| Format | PNG |
| Edit settings | keep identity |

3. Set Model to **Sunburst** yourself (presets don't change the model).
4. Replace the 8 lines `<pose / expression> — "<caption>"` with your own. Example:

```text
1. Waving hard, one eye bigger than the other — "HI!!"
2. Bowing with hands together — "THANK YOU"
3. Thumbs up, crooked grin — "OK!"
4. Melting into a puddle, flattened body — "so tired..."
5. Crying waterfall tears — "NOOO"
6. Laughing, rolling sideways — "LOL"
7. Peeking from the edge, only head visible — "...hm?"
8. Holding a heart, stretched tall and wobbly — "LOVE U"
```

**For the next sheet,** keep everything the same and change only the 8 lines. That keeps the whole set consistent.

**Rules from LINE's review guideline to keep in mind while writing poses and captions:**
- Every sticker needs the **character**, not just words. Images that "only feature text or phrases" are rejected (1.6), and so are logo-only images (1.5).
- Make them **useful in chat**: reactions, replies and feelings. Objects or scenery alone are "not easy to use in daily conversation" (1.2).
- **Avoid tall, full-length poses.** "Full-length illustrations of tall characters" count as poor visibility (1.3). The big-head, tiny-body style already helps.
- **Vary the set.** Sets that "significantly lack variety" are rejected (1.4), so mix colors, poses and captions across sheets.
- **No other apps or services** in captions or drawings (4.3), no ads or promotions (4.4), and no URLs.

> No reference image? The preset also exists without one (the Presets menu when no reference images are loaded). There you describe the character in the `Character:` line instead. Use it for quick tests; use the reference version for the real set.

### Caption ideas for a 40-sticker set

Pick what fits your character. Short captions (1–3 words) read best at chat size.

| Sheet | Theme | Ideas |
|---|---|---|
| 1 | Everyday basics | HI!!, THANK YOU, OK!, NO, SORRY, GOOD NIGHT, GOOD MORNING, BYE |
| 2 | Big feelings | LOL, NOOO (crying), ANGRY, LOVE U, WOW!, ?!, so tired..., YAY |
| 3 | Replies | wait..., ON MY WAY, BUSY, ...hm?, SURE!, NOPE, maybe?, DONE! |
| 4 | Daily life | HUNGRY, EATING, SLEEPY, WORKING, PARTY!, SHOWER, GAMING, RAINY |
| 5 | Silly / signature | the character's prop gag, a weird stretched pose, melting, hiding, dramatic faint, peeking, spinning, a "CONGRATS!" |

If you want Thai captions, write the Thai text exactly in quotes and check the spelling carefully. Short English or Thai words both work, but check every character.

---

## Step 3: Check each sheet before splitting

Look at the full-size image, not the thumbnail.

- **Same character** in all 8 stickers (hair, colors, accessory, proportions).
- **Captions** spelled exactly as you wrote them, each one appearing once. Spelling mistakes are a listed rejection reason (1.7), and image models do sometimes misspell, so read every word.
- **No extra text**, logos or watermarks.
- **Transparent background.** A grey-and-white checkerboard *painted into* the image is not transparency. If you see one, regenerate.
- **Gaps between stickers.** No two stickers touch, and none touches the edge.

If one or two stickers are bad, you can either regenerate the whole sheet or regenerate with the bad ones replaced by new poses and only keep the good files after splitting.

---

## Step 4: Split the sheets into LINE files

Download each sheet as PNG, then run from the project folder:

```powershell
# First sheet → 01.png–08.png + main.png + tab.png
pnpm stickers:split C:\stickers\sheet1.png C:\stickers\my-set

# Second sheet → 09.png–16.png (same folder)
pnpm stickers:split C:\stickers\sheet2.png C:\stickers\my-set --start 9

# Third sheet → 17.png–24.png
pnpm stickers:split C:\stickers\sheet3.png C:\stickers\my-set --start 17
```

`--start` for each sheet: 1, 9, 17, 25, 33.

What the script does:
- Finds each sticker by the transparent gaps and numbers them left to right, top row first.
- Keeps small loose bits (sparkles, sweat drops) with the nearest sticker.
- Trims each one and fits it inside **370 × 320** with a 10 px margin, transparent PNG.
- From the first sheet only, makes **main.png** (240 × 240) and **tab.png** (96 × 74) from sticker 1.

### Script options

| Option | What it does | Default |
|---|---|---|
| `[out-dir]` | Output folder (second argument) | `<sheet-name>-stickers` next to the sheet |
| `--start N` | Number of the first file | 1 |
| `--grid 4x2` | Cut by fixed cells instead of auto-detecting | off (auto) |
| `--expect N` | Warn if a different count is found | 8 |
| `--main N` | Which sticker becomes main/tab (`0` = skip) | 1 |
| `--alpha N` | How opaque (0–255) a pixel must be to count | 16 |

---

## Step 5: Final check and upload

- [ ] Total number of stickers is **8, 16, 24, 32 or 40**.
- [ ] Files are numbered with no gaps (01, 02, 03 …).
- [ ] Open a few files: each sticker is complete (nothing cut off) and readable at small size.
- [ ] `main.png` and `tab.png` look good. To use a different sticker, re-run the first sheet with `--main N`.
- [ ] `main.png` and `tab.png` show a sticker that is really in the set. Main or tab images "completely different from the stickers actually on sale" are rejected (1.9).
- [ ] No warnings about files over 1 MB.
- [ ] If you upload as one ZIP, it is **60 MB or smaller**.

Then upload in **LINE Creators Market** (creator.line.me). You choose the number of stickers on the *Manage Stickers* page and can change it before submitting.

### Title, description and other text you type in

| Field | Max length |
|---|---|
| Sticker title | 40 characters |
| Creator | 50 characters |
| Sticker description | 160 characters |
| Copyright | 50 characters |

Thai and other Asian characters (and some symbols) **count as 2 characters each**, so a Thai title can be only about 20 characters.

The review guideline also rejects text that:
- has spelling mistakes (2.2)
- contains advertising (2.3) or URLs (2.4)
- contains emoji such as hearts, or other characters that may look different on other devices (2.5)
- is extremely short (2.6)
- conflicts with the sticker images (2.7), or a title and description that conflict with each other (1.8)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Script says "no transparent background" | Regenerate with Background = transparent and Format = PNG. JPEG can't be transparent. |
| Script found 7 or 9 stickers instead of 8 | Two stickers touched, or one broke apart. Re-run with `--grid 4x2`. |
| A sticker has a bit of its neighbour in it | Use `--grid 4x2`, or regenerate asking for wider gaps. |
| Character looks different between sheets | Make sure the character sheet is loaded as a reference and you used the *edit* version of the preset. Don't change anything except the 8 lines. |
| Caption spelled wrong | Regenerate. Fewer words per caption and quality `xhigh` both help. |
| Stickers look blurry after splitting | Make sure Size tier was **2K**, not 1K. |
| Wrong order of files | The script reads rows top to bottom, then left to right. Rename the files if a sheet came out uneven. |
| Preset not in the menu | With reference images loaded, only edit presets show. Remove the references to see the no-reference version. |

---

## Reference

### LINE sticker specs

Checked against LINE's [sticker creation guideline](https://creator.line.me/en/guideline/sticker/) and [review guideline](https://creator.line.me/en/review_guideline/) on 2026-11-13.

| Image | Size | Notes |
|---|---|---|
| Sticker | max **370 × 320** px | Even width and height, ~10 px margin |
| Main image | **240 × 240** px | Shown in the sticker shop |
| Chat tab image | **96 × 74** px | Shown in the chat sticker tab |
| Set size | 8, 16, 24, 32 or 40 stickers | |

Every image: **PNG**, **transparent background**, **1 MB or less**, at least **72 dpi**, **RGB** color mode. A ZIP of all images must be **60 MB or smaller**. The split script's output already meets the size, PNG, transparency, 72 dpi and RGB rules.

LINE's guideline doesn't specify file names; the script's `01.png`, `main.png`, `tab.png` naming is just for keeping the set in order. Neither page mentions AI-generated images; the copyright rules (5.1–5.4) and the duplicates rule (1.10) still apply.

### Where things live in this project

| What | Where |
|---|---|
| Preset text and settings | `src/lib/prompt-presets.ts` (ids `line-sticker-sheet`, `line-sticker-sheet-edit`) |
| Splitting script | `scripts/split-stickers.mjs` (`pnpm stickers:split`) |
| Size / Custom size options | `src/lib/openai.ts`, `src/components/generate-panel.tsx` |
| GPT Image prompting guide | `src/docs/gpt-image-2.6-prompting guide.md` |
