import {
  DEFAULT_BRAND_LANGUAGE,
  MAX_COLORS,
  EMPTY_BRAND_KIT,
  sanitizeBrandKit,
  type BrandColor,
  type BrandKit,
} from "@/lib/brands";

// DESIGN.md import/export for brand kits (BRANDS.md decision 3). Export is a fixed layout we
// can round-trip exactly; import is best-effort so hand-written or third-party DESIGN.md files
// still load: recognised sections fill their fields and everything else lands in `notes`, so
// nothing the user pasted is silently dropped. Pure, so the dialog and the API share it.

export type ParsedBrand = { name: string; kit: BrandKit; language: string };

export function brandToDesignMd({ name, kit, language }: ParsedBrand): string {
  const out: string[] = [`# ${name}`, "", `Language: ${language}`];
  const section = (heading: string, body: string) => {
    if (body.trim()) out.push("", `## ${heading}`, "", body.trim());
  };
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

  section(
    "Colors",
    list(kit.colors.map((c) => `\`${c.hex}\` ${c.role || "color"}${c.note ? ` — ${c.note}` : ""}`))
  );
  section("Typography", kit.typeFeel);
  section("Style", kit.style);
  section("Do", list(kit.dos));
  section("Don't", list(kit.donts));
  section("Standing text", kit.standingText);
  section("Notes", kit.notes);
  return out.join("\n") + "\n";
}

type Field = "colors" | "typeFeel" | "style" | "dos" | "donts" | "dosDonts" | "standingText" | "notes";

// Matched against the normalised heading (lowercase, letters only), first match wins, so the
// combined "Do's and Don'ts" heading must come before the plain do / don't ones.
const HEADINGS: Array<[RegExp, Field]> = [
  [/^(colou?rs?|palette|colou?r palette|brand colou?rs?)$/, "colors"],
  [/^(do'?s?|don'?t'?s?)( (and|&) (do'?s?|don'?t'?s?))?$/, "dosDonts"],
  [/(typography|type|fonts?|typeface)/, "typeFeel"],
  // DESIGN.md files usually describe the overall feel in an "Overview" intro.
  [/(style|mood|look|visual|imagery|tone|overview|personality|aesthetic|identity|^brand$)/, "style"],
  [/(standing text|contact|footer|fixed text)/, "standingText"],
  [/^notes?$/, "notes"],
];

const HEX_RE = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/i;

function headingField(heading: string): Field | null {
  const h = heading.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' &]/g, " ").replace(/\s+/g, " ").trim();
  if (/^do'?s?$/.test(h)) return "dos";
  if (/^(don'?t'?s?|avoid)$/.test(h)) return "donts";
  return HEADINGS.find(([re]) => re.test(h))?.[1] ?? null;
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
}

function parseColor(line: string): BrandColor | null {
  const m = line.match(HEX_RE);
  if (!m) return null;
  let hex = m[0].toUpperCase();
  if (hex.length === 4) hex = "#" + [...hex.slice(1)].map((c) => c + c).join("");
  // Whatever surrounds the hex: the first chunk is the role, the rest is the usage note.
  const parts = stripBullet(line.replace(m[0], " "))
    .replace(/[*`_]/g, "")
    .split(/\s+[—–-]\s+|\s*[|:]\s*|\s*[()]\s*/)
    // A separator left touching a chunk (e.g. "Name: #hex — note") isn't part of its text.
    .map((p) => p.replace(/^[—–-]+\s*|\s*[—–-]+$/g, "").trim())
    .filter(Boolean);
  const [role = "", ...rest] = parts;
  const note = rest.join(", ");
  return { hex, role, ...(note ? { note } : {}) };
}

/** True for list items that read as a "don't" in a combined Do's & Don'ts section. */
function isDont(item: string): boolean {
  return /^(?:\**\s*)?(?:don'?t|do not|avoid|never|no\b|❌|✗|✘|⛔)/i.test(item);
}

// The list it lands in already says do or don't, so a leading "Do" / "Don't:" is dropped.
function cleanListItem(item: string): string {
  const cleaned = item
    .replace(/^[✅✓✔❌✗✘⛔]\s*/u, "")
    .replace(/^(?:\**\s*)?(?:(?:do(?:n'?t| not)?|avoid)\s*\**\s*:|don'?t\b|do not\b|do\b)\s*/i, "")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseDesignMd(markdown: string): ParsedBrand {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let name = "";
  let language = "";
  const kit: BrandKit = { ...EMPTY_BRAND_KIT, colors: [], dos: [], donts: [] };
  const text: Partial<Record<"typeFeel" | "style" | "standingText", string[]>> = {};
  const notes: string[] = [];

  let field: Field | null = null;
  let unknownHeading: string | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && !name) {
      name = h1[1].replace(/\s*[—–-]?\s*design\.md\s*$/i, "").trim();
      continue;
    }
    const heading = line.match(/^#{2,6}\s+(.+)$/);
    if (heading) {
      field = headingField(heading[1]);
      unknownHeading = field ? null : heading[1].trim();
      if (unknownHeading) notes.push("", `${unknownHeading}:`);
      continue;
    }
    const lang = line.match(/^\s*\**language\**\s*:\s*\**\s*(.+?)\s*\**\s*$/i);
    if (lang && !language) {
      language = lang[1];
      continue;
    }
    if (!line.trim() || /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      // Blank lines only matter inside free text; table separators and --- rules never do.
      if (!line.trim() && field && field !== "colors") pushText(field, "");
      continue;
    }

    // A hex outside any section (e.g. a "Brand" intro listing colours) still counts.
    const color = field === "colors" || !field ? parseColor(line) : null;
    if (color) {
      kit.colors.push(color);
      continue;
    }

    switch (field) {
      case "dos":
      case "donts":
      case "dosDonts": {
        const item = stripBullet(line);
        const target = field === "dosDonts" ? (isDont(item) ? "donts" : "dos") : field;
        kit[target].push(cleanListItem(item));
        break;
      }
      case "typeFeel":
      case "style":
      case "standingText":
        pushText(field, line);
        break;
      case "colors":
        // A table header row has no hex and says nothing worth keeping.
        if (!line.trim().startsWith("|")) notes.push(stripBullet(line));
        break;
      default:
        notes.push(line);
    }
  }

  function pushText(f: Field, line: string) {
    if (f === "typeFeel" || f === "style" || f === "standingText") (text[f] ??= []).push(line);
    else if (f === "notes") notes.push(line);
  }

  // Colours past the kit's limit would be dropped by sanitizeBrandKit, so keep them in Notes.
  const extra = kit.colors.splice(MAX_COLORS);
  if (extra.length) {
    notes.push("", "More colours:", ...extra.map((c) => `- \`${c.hex}\` ${c.role}${c.note ? ` — ${c.note}` : ""}`));
  }

  const join = (ls: string[] = []) => ls.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  kit.typeFeel = join(text.typeFeel);
  kit.style = join(text.style);
  kit.standingText = join(text.standingText);
  kit.notes = join(notes);

  return {
    name: name || "Imported brand",
    kit: sanitizeBrandKit(kit),
    language: language || DEFAULT_BRAND_LANGUAGE,
  };
}
