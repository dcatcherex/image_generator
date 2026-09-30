"use client";

import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Coins,
  GitCompare,
  HelpCircle,
  Images,
  Paintbrush2,
  Ratio,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SIZE_TIERS, sizeFromAspectRatio } from "@/lib/openai";
import { BATCH_PRICE_MULTIPLIER, estimateCost, formatCostThb, previewCostUsd } from "@/lib/pricing";
import { PROMPT_PRESETS } from "@/lib/prompt-presets";
import { PRESERVE_OPTIONS, REFERENCE_ROLES } from "@/lib/prompt-builder";
import { cn } from "cn";

// Prices quoted in the manual come from the same functions as the cost badge, so the text
// stays right if the token table or the THB rate changes. Keep in sync with PREVIEW_PARTIALS
// in generate-panel.tsx.
const PREVIEW_PARTIALS = 2;
const PRICE_LOW = formatCostThb(estimateCost("low", "1024x1536").usd);
const PRICE_HIGH = formatCostThb(estimateCost("high", "1024x1536").usd);
const PRICE_PREVIEW = formatCostThb(previewCostUsd(PREVIEW_PARTIALS));
const ECONOMY_PERCENT = Math.round((1 - BATCH_PRICE_MULTIPLIER) * 100);

function H({ children }: { children: ReactNode }) {
  return <h4 className="mt-5 mb-1.5 text-sm font-semibold first:mt-0">{children}</h4>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm leading-relaxed text-foreground/90">{children}</p>;
}

function List({ children, ordered }: { children: ReactNode; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={cn("mb-2 flex flex-col gap-1 pl-5 text-sm leading-relaxed text-foreground/90", ordered ? "list-decimal" : "list-disc")}>
      {children}
    </Tag>
  );
}

/** A control's on-screen name, styled so readers can match it to the UI. */
function K({ children }: { children: ReactNode }) {
  return <span className="rounded bg-muted px-1 py-px text-[0.8rem] font-medium">{children}</span>;
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 rounded-md border-l-2 border-primary bg-muted/50 px-3 py-2 text-sm leading-relaxed">
      {children}
    </div>
  );
}

const SECTIONS: Array<{ id: string; label: string; icon: typeof BookOpen; body: () => ReactNode }> = [
  {
    id: "start",
    label: "Getting started",
    icon: BookOpen,
    body: () => (
      <>
        <H>Make your first image</H>
        <List ordered>
          <li>Type what you want in <K>Prompt</K> on the right. Say what the image is for (a photo, an ad, a diagram), the subject, the composition and the style.</li>
          <li>Pick <K>Size</K> (aspect ratio) and <K>Quality</K>. <K>low</K> is cheap and fine for drafts; use <K>medium</K> or <K>high</K> for final images and any text.</li>
          <li>Check the price on the button area, then click <K>Generate</K>. The image appears at the top of the gallery.</li>
        </List>
        <H>The two models</H>
        <P>
          <K>Sunburst</K> is the larger model, tuned for quality. <K>Flare</K> is the smaller one, tuned for speed, with quality close to GPT Image 2. Both cost the same per token. Start with Sunburst for demanding work, then try Flare on the same prompt to see if it&apos;s good enough and faster. <K>Compare models</K> does exactly that in one click.
        </P>
        <H>Refine one thing at a time</H>
        <P>
          Inspect each result, then change one thing: the prompt, the quality, or the model. For an image that&apos;s close, use <K>Refine</K> to edit it rather than generating from scratch.
        </P>
      </>
    ),
  },
  {
    id: "prompts",
    label: "Writing prompts",
    icon: Sparkles,
    body: () => (
      <>
        <H>Presets</H>
        <P>
          <K>Presets…</K> above the prompt fills in a ready-made template with labelled sections (Scene, Subject, Style, Constraints) and sets suitable options. Replace every <K>&lt;placeholder&gt;</K> before generating. If the prompt already has text, you&apos;re asked before it&apos;s replaced.
        </P>
        <P>
          For new images: {PROMPT_PRESETS.filter((p) => p.mode === "generate").map((p) => p.label).join(", ")}. With reference images loaded, the list switches to edit presets: {PROMPT_PRESETS.filter((p) => p.mode === "edit").map((p) => p.label).join(", ")}.
        </P>
        <Tip>Presets set Quality to high. Switch it back to low while you&apos;re experimenting to save money.</Tip>
        <H>Exact text</H>
        <P>
          For words that must appear in the image (a tagline, a sign, a label), open <K>Exact text</K> under the prompt and type them there. The app tells the model to render them word for word, exactly once, with no other text. Always check spelling in the result; small text renders better at medium or high quality.
        </P>
        <H>What makes a good prompt</H>
        <List>
          <li><b>Say what it&apos;s for:</b> “a product photo for an online shop”, “a slide for a pitch deck”.</li>
          <li><b>Describe what you can see:</b> materials, lighting, colours, and the medium (“photorealistic”, “watercolour”, “flat vector”).</li>
          <li><b>For people, describe framing and action:</b> “full body visible, feet included”, “looking down at the open book”.</li>
          <li><b>For diagrams and slides, give the real content:</b> the exact labels, numbers and title.</li>
          <li><b>Say what you don&apos;t want:</b> “no watermarks, no extra text, no logos”.</li>
          <li><b>Long prompts:</b> use labelled lines (Scene: … Subject: … Constraints: …) so they&apos;re easy to adjust later.</li>
        </List>
      </>
    ),
  },
  {
    id: "size",
    label: "Size & format",
    icon: Ratio,
    body: () => (
      <>
        <H>Size and size tier</H>
        <P>
          <K>Size</K> picks the aspect ratio; <K>Size tier</K> picks the resolution. The label shows the exact pixels, for example 16:9 is {sizeFromAspectRatio(16, 9, "1K")} at 1K, {sizeFromAspectRatio(16, 9, "2K")} at 2K and {sizeFromAspectRatio(16, 9, "4K")} at 4K.
        </P>
        <List>
          {SIZE_TIERS.map((t) => (
            <li key={t.id}>
              <b>{t.label}</b>
              {t.id === "1K" && ": about 1.5 megapixels. The default; fastest and cheapest."}
              {t.id === "2K" && ": up to 2560×1440. The largest fully supported size."}
              {t.id === "4K" && ": up to 3840×2160. Experimental: slower, can fail, and may take minutes."}
            </li>
          ))}
        </List>
        <P>With Size <K>Auto</K> the model picks the dimensions, and the tier is disabled. The gallery shows the real size it chose.</P>
        <H>Format and compression</H>
        <P>
          <K>PNG</K> is lossless and supports transparency. <K>WebP</K> is smaller and also supports transparency. <K>JPEG</K> is smallest but can&apos;t be transparent. <K>Compression</K> (JPEG and WebP only) trades quality for file size; leave it untouched to use OpenAI&apos;s default.
        </P>
        <H>Transparent backgrounds</H>
        <P>
          Set <K>Background</K> to <K>Transparent</K> and use PNG or WebP (JPEG is disabled while Transparent is selected). Also say so in the prompt: “isolated on a fully transparent background, no shadow”. After generating, the app checks the real pixels; a red badge on the card means the model returned a solid background anyway. Try again, or edit with the <K>Product cutout</K> preset.
        </P>
      </>
    ),
  },
  {
    id: "edit",
    label: "Editing images",
    icon: Paintbrush2,
    body: () => (
      <>
        <H>Reference images</H>
        <P>
          Add images by uploading, dropping them on the panel, or clicking <K>Use as reference</K> on a gallery image. With references loaded, the button becomes <K>Apply edit</K> and your prompt describes how to change them.
        </P>
        <H>Give each reference a role</H>
        <P>
          Each thumbnail has a role dropdown ({REFERENCE_ROLES.map((r) => r.label).join(", ")}) and an optional note. Roles become a numbered list at the top of the prompt, so you can write “put the jacket from image 2 on the person in image 1”. A single reference is treated as the subject automatically.
        </P>
        <H>Change only, and what to preserve</H>
        <P>
          Type the one thing to change in <K>Change only…</K> and tap the chips for what must stay the same: {PRESERVE_OPTIONS.map((o) => o.label).join(", ")}. Being explicit here is what keeps faces, products and layouts intact.
        </P>
        <H>Refine and versions</H>
        <P>
          <K>Refine</K> (on a card or in the lightbox) starts a follow-up edit of that one image and carries its Change only and preserve settings forward. Ask for one change per step. Every image in a refine chain shows a <K>Versions</K> strip in the lightbox, oldest first, so you can go back to any step. <K>Use as reference</K> is different: it adds the image to the current references without linking versions.
        </P>
        <H>Masks: edit one area only</H>
        <P>
          With exactly one reference, click <K>Draw mask</K> and paint over the area to change. Keep <K>Keep unmasked area pixel-identical</K> ticked: everything outside the mask is copied back from the original, so it can&apos;t drift. Untick it only if you want the model to blend its changes beyond the painted area.
        </P>
        <Tip>Repeated edits can slowly change details you meant to keep. Re-select the preserve chips each time, or use a mask when something must stay exactly as it is.</Tip>
      </>
    ),
  },
  {
    id: "compare",
    label: "Comparing models",
    icon: GitCompare,
    body: () => (
      <>
        <P>
          Turn on <K>Compare models</K> to run the same prompt and settings on Sunburst and Flare at the same time. When both finish, a <K>Model comparison</K> window shows them side by side with each one&apos;s cost and generation time.
        </P>
        <List>
          <li><K>Keep both</K> closes the window; both images stay in the gallery.</li>
          <li><K>Keep Sunburst</K> or <K>Keep Flare</K> deletes the other one.</li>
        </List>
        <P>It only works for a single new image: it&apos;s hidden in edit mode, in Economy mode and when Batch (n) is above 1. It costs the price of two images.</P>
        <Tip>If Flare&apos;s result is good enough for a kind of image, use it: it&apos;s usually faster at the same token price.</Tip>
      </>
    ),
  },
  {
    id: "cost",
    label: "Costs & Economy",
    icon: Coins,
    body: () => (
      <>
        <H>The price badge</H>
        <P>
          The badge next to the button estimates the cost in baht before you spend anything. For example, one 2:3 image at 1K costs about {PRICE_LOW} at low and {PRICE_HIGH} at high. A <K>~</K> in front means approximate: the size isn&apos;t one OpenAI publishes a price for, or quality is Auto. Once you&apos;ve made three or more images with the same model, quality and size, the badge uses their real average instead.
        </P>
        <H>Real cost on every image</H>
        <P>
          After generating, each card shows what the image actually cost (from OpenAI&apos;s usage data) and how long it took, for example “{PRICE_LOW} · 9.2s”. Older images show an estimate starting with ~.
        </P>
        <H>Live preview</H>
        <P>
          <K>Live preview</K> shows the image forming while it generates. OpenAI charges for each preview frame (about {PRICE_PREVIEW} per image), so it&apos;s off by default. With it off you see a placeholder until the image is ready.
        </P>
        <H>Economy mode</H>
        <P>
          <K>Economy mode</K> sends your prompts to OpenAI&apos;s Batch service: {ECONOMY_PERCENT}% cheaper, but results take anywhere from minutes to 24 hours. Queue several prompts with <K>Add to queue</K> (each keeps its own settings), then <K>Submit batch</K>. Images appear in the gallery by themselves, even if the app is closed in the meantime. Economy mode is for new images only, not edits.
        </P>
        <Tip>Good use of Economy mode: a set of variations you don&apos;t need right now, or anything at high quality or 2K and above.</Tip>
      </>
    ),
  },
  {
    id: "gallery",
    label: "Gallery",
    icon: Images,
    body: () => (
      <>
        <H>On each card</H>
        <P>Hover a card for: favorite, <K>Use as reference</K>, <K>Refine</K>, tag, download and delete. The bottom line shows cost and generation time.</P>
        <H>In the lightbox</H>
        <P>
          Click an image to open it large. You&apos;ll see its size, quality and model, and the full prompt that was sent (including the Inputs, Constraints and Text sections the app added). <K>Use as prompt</K> puts your original short prompt, exact text and edit settings back into the panel. Use the arrow keys to flip between images.
        </P>
        <H>Finding images</H>
        <P>Search by prompt words, show favorites only, or filter by tag at the top of the gallery.</P>
      </>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
    body: () => (
      <>
        <P>Open Settings with the gear icon in the top bar.</P>
        <List>
          <li><b>Appearance:</b> system, light or dark theme.</li>
          <li><b>Gallery:</b> grid or masonry layout, and the number of columns.</li>
          <li><b>Generate panel:</b> hide any option you don&apos;t use. A hidden option keeps its current value. Hiding Exact text, Compression or Change only / Preserve also stops them being applied.</li>
        </List>
      </>
    ),
  },
];

export function HelpDialog() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="icon" className="size-8" aria-label="Help" />}
      >
        <HelpCircle className="size-4" />
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">User manual</DialogTitle>
        <div className="flex h-[min(560px,80vh)] flex-col sm:flex-row">
          {/* Horizontal, scrollable tabs on phones; a sidebar like Settings on wider screens. */}
          <nav
            aria-label="Manual sections"
            className="flex shrink-0 gap-1 overflow-x-auto border-b bg-muted/40 p-2 sm:w-48 sm:flex-col sm:overflow-x-visible sm:border-r sm:border-b-0 sm:p-3"
          >
            <span className="hidden px-2 pb-2 text-xs font-medium text-muted-foreground sm:block">
              User manual
            </span>
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === active ? "page" : undefined}
                onClick={() => setActive(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                  item.id === active && "bg-background font-medium text-foreground shadow-sm"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>

          {/* Keyed so switching sections starts at the top instead of the old scroll position. */}
          <ScrollArea key={section.id} className="flex-1 min-h-0">
            <div className="p-5">
              <h3 className="mb-3 text-base font-semibold">{section.label}</h3>
              {section.body()}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
