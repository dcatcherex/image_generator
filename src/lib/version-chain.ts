import type { ImageRecord } from "./types";

/**
 * The refine chain an image belongs to: walk `parentImageId` up to the root (a missing
 * parent, e.g. a deleted image, just makes the topmost surviving ancestor the root), then
 * collect every descendant of that root. Oldest first. Returns just [image] when unrelated.
 */
export function getVersionChain(images: ImageRecord[], id: string): ImageRecord[] {
  const byId = new Map(images.map((i) => [i.id, i]));
  let root = byId.get(id);
  if (!root) return [];
  const seen = new Set<string>();
  while (root.parentImageId && byId.has(root.parentImageId) && !seen.has(root.id)) {
    seen.add(root.id);
    root = byId.get(root.parentImageId)!;
  }

  const childrenOf = new Map<string, ImageRecord[]>();
  for (const img of images) {
    if (!img.parentImageId) continue;
    const list = childrenOf.get(img.parentImageId) ?? [];
    list.push(img);
    childrenOf.set(img.parentImageId, list);
  }

  const chain = [root];
  const visited = new Set([root.id]);
  for (let i = 0; i < chain.length; i++) {
    for (const child of childrenOf.get(chain[i].id) ?? []) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        chain.push(child);
      }
    }
  }
  return chain.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
