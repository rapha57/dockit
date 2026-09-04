import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { ThemeScript, ThemedToaster } from "@/components/theme";
import { ConfirmHost } from "@/components/confirm-dialog";
import appCss from "../styles.css?url";

const APP_NAME = "Dockit";

function ClearChunkReload() {
  useEffect(() => {
    try {
      sessionStorage.removeItem("portal-chunk-reload");
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}

function RootShell() {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <HeadContent />
      </head>
      <body className="min-h-dvh text-fg antialiased">
        <ClearChunkReload />
        <Outlet />
        <ConfirmHost />
        <ThemedToaster />
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#fcfcfc" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: `/favicon.svg?v=${APP_NAME}` },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootShell,
});
