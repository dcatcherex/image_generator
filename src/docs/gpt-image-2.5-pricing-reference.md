# GPT Image 2.5 pricing reference

Checked: **2026-09-30**. Currency: **USD**. Scope: public OpenAI API pricing for `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare`, including standard and cached rates, Batch availability, other processing modes, regional processing uplifts, and image output estimates through 4K. The supplied application's sizes do not limit this reference.

Both models have the same published token rates. OpenAI's live calculator currently groups them under **GPT Image 2.5 (Sunburst and Flare)** and returns the output estimates below. These are official calculator estimates, not measured invoices or guaranteed total request prices.

## Published token rates

| Token category | Sunburst: USD per 1 million tokens | Flare: USD per 1 million tokens |
| --- | ---: | ---: |
| Image input | $8.00 | $8.00 |
| Cached image input | $2.00 | $2.00 |
| Image output | $30.00 | $30.00 |
| Text input | $5.00 | $5.00 |
| Cached text input | $1.25 | $1.25 |
| Text output | Not applicable: image output only | Not applicable: image output only |

Source: [OpenAI pricing — image generation models, Standard](https://developers.openai.com/api/docs/pricing#image-generation).

## Batch and other processing modes

**Neither GPT Image 2.5 model currently has published Batch rates. Their model pages show the Batch endpoint as unsupported.** This was checked against both rendered model pages as well as the Standard and Batch sections of the pricing page. A text-only search result may include the word “Batch” because the model page lists unsupported endpoints too.

**Observed in practice (2026-09-30):** the Batch API *does* accept `gpt-image-2.5-sunburst` on `/v1/images/generations`. This app's Economy mode submitted 4 Sunburst batches on 2026-09-27 and 2026-09-28; all 4 completed (9 images, 0 failed) and every output line carried a per-request `usage` object. Billing later confirmed a 50% discount — see [Verifying the Batch price](#verifying-the-batch-price). Flare has not been tried through Batch.

| Mode | Sunburst | Flare |
| --- | --- | --- |
| Standard | Published rates above | Published rates above |
| Batch API | Direct Batch endpoint shown as unsupported; no published model-specific rates | Direct Batch endpoint shown as unsupported; no published model-specific rates |
| Flex | No model-specific rate published in the checked pricing tables | No model-specific rate published in the checked pricing tables |
| Fast / Priority | No model-specific rate published in the checked pricing tables | No model-specific rate published in the checked pricing tables |
| Ultrafast | No model-specific rate published in the checked pricing tables | No model-specific rate published in the checked pricing tables |

The [Batch guide](https://developers.openai.com/api/docs/guides/batch) describes a 50% discount and a 24-hour completion window for supported models, and includes image generation/edit endpoints. It also directs readers to each model's availability. That general discount does not establish GPT Image 2.5 eligibility. A supported mainline model in a Responses batch likewise does not by itself establish discounted pricing or support for its GPT Image 2.5 tool calls; this combination was not confirmed by the checked sources.

For comparison only, **GPT Image 2** has these published Batch rates per million tokens:

| Token category | GPT Image 2 Batch rate (not GPT Image 2.5) |
| --- | ---: |
| Image input | $4.00 |
| Cached image input | $1.00 |
| Image output | $15.00 |
| Text input | $2.50 |
| Cached text input | $0.625 |

Do not apply these prices or halve the GPT Image 2.5 output estimates as if they were confirmed 2.5 Batch prices. An unavailable or unpublished price is not $0.

### Verifying the Batch price

The 9 Sunburst batch images above used **16,209 image output tokens** and **3,983 text input tokens** (no image input). Expected charge:

| Pricing assumption | Charge for those 9 images |
| --- | ---: |
| Standard rates | 16,209 × $30/M + 3,983 × $5/M = **$0.506** |
| 50% Batch discount | **$0.253** |

1. **From existing billing:** in the OpenAI dashboard, open Usage / Costs for 2026-09-27 and 2026-09-28 and look for a Batch line item for image generation. ~$0.25 means the 50% discount applies; ~$0.51 means Batch is billed at standard rates.
2. **Controlled test, if billing doesn't separate Batch from instant usage:** create a dedicated OpenAI project and API key (costs are reported per project), submit one batch of 10 × `high` 1024×1024 (17,560 output tokens), and compare the next day's project cost against **$0.527** (standard) vs **$0.263** (50%). Maximum spend ≈ $0.53.

**Result (verified 2026-09-30 from a Cost export grouped by Line Item):** the Batch API bills GPT Image 2.5 Sunburst at **exactly 50% of standard rates** — image output **$15/M**, text input **$2.50/M** (image input presumably $4/M; not exercised). Line items are named `batch api | gpt-image-2.5-sunburst image` / `... text`, and a batch is billed on the UTC day it **completes**, not the day it's submitted.

| Day (UTC) | Batch(es) completed | Image output tokens → billed | Text input tokens → billed |
| --- | --- | ---: | ---: |
| 2026-09-27 | batch 1 | 4,116 → $0.06174 | 667 → $0.0016675 |
| 2026-09-28 | batches 2 + 4 | 10,463 → $0.156945 | 2,122 → $0.005305 |
| 2026-09-29 | batch 3 | 1,630 → $0.02445 | 1,194 → $0.002985 |
| **Total** | | **$0.243135** | **$0.0099575** |

Total billed $0.2531 = the 50% prediction ($0.253). Token counts match the batch output `usage` exactly. The same export confirms the standard rates on non-batch lines: $30/M image output, $8/M image input, $5/M text input. Flare through Batch remains untested; assume the same 50% if it's accepted.

Sources: [Sunburst model](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), [Flare model](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [image pricing — Standard and Batch](https://developers.openai.com/api/docs/pricing#image-generation), and [Batch model availability](https://developers.openai.com/api/docs/guides/batch#model-availability).

## Estimated image output prices

Each cell shows **USD per image (output tokens)**. Read directly from the official calculator for all 15 quality/size combinations with the grouped GPT Image 2.5 option selected.

| Quality | 1024 × 1024 | 1024 × 1536 | 1536 × 1024 |
| --- | ---: | ---: | ---: |
| `low` | $0.00588 (196) | $0.00474 (158) | $0.00474 (158) |
| `medium` | $0.01317 (439) | $0.01029 (343) | $0.01029 (343) |
| `high` | $0.05268 (1,756) | $0.04116 (1,372) | $0.04116 (1,372) |
| `xhigh` | $0.09366 (3,122) | $0.07377 (2,459) | $0.07377 (2,459) |
| `max` | $0.21072 (7,024) | $0.16464 (5,488) | $0.16464 (5,488) |

Source: [OpenAI image generation guide — GPT Image 2.5 and GPT Image 2 output tokens](https://developers.openai.com/api/docs/guides/image-generation#gpt-image-25-and-gpt-image-2-output-tokens).

Arithmetic: image output cost = output tokens × $30 / 1,000,000. Every amount above matches that calculation. `auto` has no single fixed estimate because the model chooses the output settings. The guide also cautions that equal token rates do not guarantee equal actual cost per image across models and quality settings; measure response usage for your workload.

### Additional dimensions, including 4K

The same official GPT Image 2.5 calculator was checked for all 30 combinations below. Each cell is **USD per image (output tokens)**, excluding input and other charges.

| Dimensions | `low` | `medium` | `high` | `xhigh` | `max` |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1536 × 864 | $0.00360 (120) | $0.00840 (280) | $0.03234 (1,078) | $0.05751 (1,917) | $0.12936 (4,312) |
| 2048 × 1152 | $0.00471 (157) | $0.01101 (367) | $0.04239 (1,413) | $0.07533 (2,511) | $0.16950 (5,650) |
| 2560 × 1440 | $0.00615 (205) | $0.01434 (478) | $0.05529 (1,843) | $0.09828 (3,276) | $0.22110 (7,370) |
| 2048 × 2048 | $0.01191 (397) | $0.02676 (892) | $0.10704 (3,568) | $0.19029 (6,343) | $0.42816 (14,272) |
| 3840 × 2160 | $0.01113 (371) | $0.02595 (865) | $0.10008 (3,336) | $0.17790 (5,930) | $0.40026 (13,342) |
| 2160 × 3840 | $0.01113 (371) | $0.02595 (865) | $0.10008 (3,336) | $0.17790 (5,930) | $0.40026 (13,342) |

**Recheck:** the 2048 × 2048 row costs *more* than 3840 × 2160 at every quality (e.g. 14,272 vs 13,342 tokens at `max`) despite having half the pixels. The ratios are internally consistent, so it is probably real, but confirm that row in the calculator once.

These nine dimensions are examples, not an exhaustive list of supported sizes. For other dimensions, select GPT Image 2.5 in the [official calculator](https://developers.openai.com/api/docs/guides/image-generation#gpt-image-25-and-gpt-image-2-output-tokens); do not interpolate from megapixels or substitute the GPT Image 2 setting.

Custom-size constraints: both edges must be multiples of 16 and no larger than 3840 pixels; aspect ratio must be between 1:3 and 3:1; total pixels must be between 655,360 and 8,294,400. The guide marks resolutions above 2560 × 1440 as experimental. Source: [size and quality options](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options).

The model detail pages still caution that the GPT Image 2 calculator cannot estimate 2.5 consumption. The values in this document use the separate **GPT Image 2.5 (Sunburst and Flare)** selection observed in the current live guide, not its GPT Image 2 selection.

## Additional charges and actual usage

The table excludes prompt text, reference/input images, and streaming partial images. For direct Images API requests, calculate the image request's usage-based cost as:

```text
USD = (text_input_tokens × 5
     + image_input_tokens × 8
     + image_output_tokens × 30) / 1,000,000
```

Each streamed partial image adds 100 image output tokens, equivalent to $0.003 at the published rate. Include those tokens once when reconciling usage. This app's live preview requests 2 partial images (`partial_images: 2` in `/api/generate`), adding **$0.006 per instant image** — about +58% at `medium` 1024×1536 ($0.01029) and more than double at `low`. The preview is being made optional (see `ENHANCEMENTS.md`).

### Observed usage from this app

Real Sunburst output tokens from the Batch outputs above, all at `high`:

| Returned size | Output tokens | Calculator |
| --- | ---: | ---: |
| 1024 × 1536 | 1,372 | 1,372 ✓ |
| 1536 × 1024 | 1,372 | 1,372 ✓ |
| 1254 × 1254 (requested `auto`) | 2,058 | — |
| 1312 × 1199 (requested `auto`) | 1,887 | — |
| 1145 × 1374 (requested `auto`) | 1,716 | — |
| 1122 × 1402 (requested `auto`) | 1,630 | — |

The two calculator-covered sizes match exactly. Requests with `size: "auto"` returned dimensions that are **not** multiples of 16; the response body's `size` field carries the actual dimensions. Responses API requests also incur the mainline model's own token charges.

Cached input discounts apply only to image generation through the Responses API, not direct Images API requests such as `/v1/images/edits`. Cached image-generation token counts are not exposed in the Responses API output, so response usage alone cannot verify those discounts; reconcile against billing.

Sources: [GPT Image 2.5 costs](https://developers.openai.com/api/docs/guides/image-generation#gpt-image-25-costs), [cached input pricing](https://developers.openai.com/api/docs/guides/image-generation#cached-input-pricing), and [partial images cost](https://developers.openai.com/api/docs/guides/image-generation#partial-images-cost).

### Regional processing and other price conditions

OpenAI documents a **10% uplift** for data residency endpoints on eligible models released on or after March 5, 2026. Both GPT Image 2.5 models and their September 8, 2026 snapshots appear in the data residency eligibility table for image generation and edits. Where this uplift applies, the derived rates are:

| Token category | Base USD / 1M | With 10% uplift: USD / 1M |
| --- | ---: | ---: |
| Image input | $8.00 | $8.80 |
| Cached image input, when eligible | $2.00 | $2.20 |
| Image output | $30.00 | $33.00 |
| Text input | $5.00 | $5.50 |
| Cached text input, when eligible | $1.25 | $1.375 |

The right column is arithmetic from the documented uplift, not a separate quoted price table. The cached-input restrictions above still apply. OpenAI also notes a 10% uplift for FedRAMP endpoints; this does not establish that either model is available in a particular FedRAMP deployment or that uplifts should be stacked.

Sources: [pricing](https://developers.openai.com/api/docs/pricing) and [data residency eligibility and pricing](https://developers.openai.com/api/docs/guides/your-data#which-models-and-features-are-eligible-for-data-residency).

No separate fixed per-image editing fee, format/compression fee, or transparent-background fee is listed for these models in the checked pricing tables. Edits still incur input-image and output-token charges. Multiple images or repeated requests consume additional tokens; sending requests concurrently or setting `n` is not the discounted Batch API. Account-specific contract rates, taxes, currency conversion, and third-party provider markups are outside these public API rates and have not been verified.

## Findings about the supplied pricing file

Reviewed: `D:/ai/tools/image generator/src/lib/pricing.ts`.

- Its five token-rate figures agree with the current official standard rates.
- Its `low`, `medium`, and `high` output table uses GPT Image 2 figures. Those are not the GPT Image 2.5 calculator estimates above.
- Its `xhigh` and `max` figures are explicitly extrapolated guesses. Official calculator estimates are now available for these settings.
- Its statement that public GPT Image 2.5 output token estimates are unavailable is outdated relative to the calculator checked today.
- Its fixed 33 THB per USD conversion is an application assumption, not OpenAI pricing or a verified current exchange rate. This reference keeps prices in USD.
- Economy mode's 50% Batch discount (`ECONOMY_DISCOUNT = 0.5`) is **correct** — confirmed by billing (see above).
- Its estimates ignore the 2 streamed preview images ($0.006 per instant image) and prompt text input.
- The app stores `size: "auto"` rather than the dimensions actually returned.

The supplied application file was not modified. Fixes are planned in `ENHANCEMENTS.md`.

## How to check again

1. Open the [official pricing page](https://developers.openai.com/api/docs/pricing#image-generation), find **Image generation models**, and check **Standard** and **Batch**. Check both exact model IDs and all five token rates. Recheck both model pages for Batch support; do not infer eligibility from the general 50% discount.
2. Open the [output token calculator](https://developers.openai.com/api/docs/guides/image-generation#gpt-image-25-and-gpt-image-2-output-tokens), select **GPT Image 2.5 (Sunburst and Flare)**, and enter each explicit quality, width, and height above. If OpenAI later separates the models, check each independently.
3. Record the displayed output tokens and output cost, then update this document's checked date. The interactive calculator is necessary: the Markdown version of the guide contains a component placeholder rather than these calculated results.
4. Check regional processing eligibility/uplifts and any newly published processing modes. Compare actual request usage and billing to these estimates, including inputs and any additional API charges.
