"use client";

import { useEffect, useState } from "react";
import { Columns3, LayoutGrid, Monitor, Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  GALLERY_COLUMNS_MAX,
  GALLERY_COLUMNS_MIN,
  type GalleryViewMode,
} from "@/lib/use-gallery-view";
import { cn } from "cn";

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

const VIEW_OPTIONS = [
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "masonry", label: "Masonry", icon: Columns3 },
] as const;

const NAV_ITEMS = [{ id: "general", label: "General", icon: SettingsIcon }] as const;

export function SettingsDialog({
  view,
  setView,
  columns,
  setColumns,
}: {
  view: GalleryViewMode;
  setView: (v: GalleryViewMode) => void;
  columns: number;
  setColumns: (n: number) => void;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard to avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="icon" className="size-8" aria-label="Settings" />}
      >
        <SettingsIcon className="size-4" />
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-[420px]">
          <div className="flex w-40 shrink-0 flex-col gap-1 border-r bg-muted/40 p-3 sm:w-48">
            <span className="px-2 pb-2 text-xs font-medium text-muted-foreground">
              Settings
            </span>
            {NAV_ITEMS.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5 text-sm font-medium shadow-sm"
              >
                <item.icon className="size-4" />
                {item.label}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <h3 className="mb-4 text-sm font-semibold">Appearance</h3>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">Theme</span>
              <div className="inline-flex rounded-lg border p-0.5">
                {THEME_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={option.label}
                    aria-pressed={mounted && theme === option.value}
                    className={cn(
                      "rounded-md text-muted-foreground",
                      mounted &&
                        theme === option.value &&
                        "bg-foreground/10 text-foreground shadow-sm"
                    )}
                    onClick={() => setTheme(option.value)}
                  >
                    <option.icon className="size-4" />
                  </Button>
                ))}
              </div>
            </div>

            <div className="my-5 border-t" />

            <h3 className="mb-4 text-sm font-semibold">Gallery</h3>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">Layout</span>
              <div className="inline-flex rounded-lg border p-0.5">
                {VIEW_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={option.label}
                    aria-pressed={view === option.value}
                    className={cn(
                      "rounded-md text-muted-foreground",
                      view === option.value && "bg-foreground/10 text-foreground shadow-sm"
                    )}
                    onClick={() => setView(option.value)}
                  >
                    <option.icon className="size-4" />
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-sm">Columns</span>
              <span className="text-xs text-muted-foreground">{columns}</span>
            </div>
            <Slider
              className="mt-2"
              min={GALLERY_COLUMNS_MIN}
              max={GALLERY_COLUMNS_MAX}
              step={1}
              value={[columns]}
              onValueChange={(v) => setColumns(Array.isArray(v) ? v[0] : v)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
