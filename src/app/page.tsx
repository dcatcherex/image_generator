"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { GeneratePanel } from "@/components/generate-panel";
import { Gallery } from "@/components/gallery";
import { ThemeToggle } from "@/components/theme-toggle";
import { referenceItemFromImage, type ReferenceItem } from "@/lib/reference-items";
import { useImageStream } from "@/lib/use-image-stream";
import type { ImageRecord } from "@/lib/types";

export default function Home() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [referenceItems, setReferenceItems] = useState<ReferenceItem[]>([]);
  const generateStream = useImageStream();

  useEffect(() => {
    fetch("/api/images")
      .then((r) => r.json())
      .then((data) => setImages(data.images ?? []))
      .finally(() => setLoading(false));
  }, []);

  function handleImageCreated(image: ImageRecord) {
    setImages((prev) => [image, ...prev]);
  }

  function handleDelete(image: ImageRecord) {
    setImages((prev) => prev.filter((i) => i.id !== image.id));
  }

  function handleToggleFavorite(image: ImageRecord) {
    setImages((prev) => prev.map((i) => (i.id === image.id ? image : i)));
  }

  async function handleUseAsReference(image: ImageRecord) {
    const item = await referenceItemFromImage(image);
    setReferenceItems((prev) => [...prev, item]);
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 h-14 border-b shrink-0 bg-background">
        <h1 className="flex items-center gap-2">
          <ImageIcon className="size-4" />
          Image Studio
        </h1>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <div className="flex flex-col lg:flex-row-reverse flex-1 min-h-0">
        <div className="lg:w-[340px] shrink-0 flex flex-col max-h-[70vh] lg:max-h-none lg:h-full min-h-0">
          <GeneratePanel
            onImageCreated={handleImageCreated}
            referenceItems={referenceItems}
            setReferenceItems={setReferenceItems}
            generateStream={generateStream}
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Loading gallery...
          </div>
        ) : (
          <Gallery
            images={images}
            onDelete={handleDelete}
            onToggleFavorite={handleToggleFavorite}
            onUseAsReference={handleUseAsReference}
            query={query}
            setQuery={setQuery}
            favoritesOnly={favoritesOnly}
            setFavoritesOnly={setFavoritesOnly}
            isGenerating={generateStream.isGenerating}
            partialPreview={generateStream.partialB64}
          />
        )}
      </div>
    </div>
  );
}
