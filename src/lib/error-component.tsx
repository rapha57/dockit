"use client";

import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

const RELOAD_KEY = "portal-chunk-reload";

function isStaleChunk(message: string) {
  return /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|mime type/i.test(
    message,
  );
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const message = error?.message || "Une erreur inattendue s’est produite.";
  const stale = isStaleChunk(message);

  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
      sessionStorage.setItem(RELOAD_KEY, "1");
    } catch {
      /* ignore */
    }
    window.location.reload();
  }, [stale]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Chargement interrompu</h1>
      <p className="max-w-md text-sm break-words text-muted">{message}</p>
      <button
        type="button"
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
        onClick={() => {
          try {
            sessionStorage.removeItem(RELOAD_KEY);
          } catch {
            /* ignore */
          }
          window.location.reload();
        }}
      >
        Recharger
      </button>
    </main>
  );
}

export function AppNotFoundComponent() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-subtle" aria-hidden="true">
        <SearchX className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">{t("notFound.title")}</h1>
      <p className="max-w-md text-sm break-words text-muted">{t("notFound.lead")}</p>
      <Button className="mt-2" onClick={() => window.location.assign("/")}>
        {t("notFound.back")}
      </Button>
    </main>
  );
}
