import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Frame-Options": "SAMEORIGIN",
	"X-DNS-Prefetch-Control": "off",
	"Content-Security-Policy":
		"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src https: http:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
};

const ASSET_URL = "/__dockit/asset/";
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const EXT_MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
};

function securityHeaders(): Plugin {
	const apply = (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
		for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
		next();
	};
	return {
		name: "dockit-security-headers",
		configureServer(server) {
			server.middlewares.use(apply);
		},
		configurePreviewServer(server) {
			server.middlewares.use(apply);
		},
	};
}

function dockitAssets(): Plugin {
	function dataDir() {
		const custom = process.env.PORTAL_DATA_FILE?.trim();
		if (custom) return dirname(custom);
		return join(process.cwd(), "data");
	}
	const handle = (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; statusCode: number; end: (b?: unknown) => void }, next: () => void) => {
		const path = (req.url || "").split("?")[0];
		if (!path.startsWith(ASSET_URL)) return next();
		const name = decodeURIComponent(path.slice(ASSET_URL.length));
		if (!NAME_RE.test(name)) {
			res.statusCode = 404;
			res.end("Not found");
			return;
		}
		const ext = name.split(".").pop()?.toLowerCase() ?? "";
		const mime = EXT_MIME[ext];
		if (!mime) {
			res.statusCode = 404;
			res.end("Not found");
			return;
		}
		readFile(join(dataDir(), "assets", name)).then((bytes) => {
			res.setHeader("Content-Type", mime);
			res.setHeader("Cache-Control", "public, max-age=86400");
			res.setHeader("X-Content-Type-Options", "nosniff");
			res.end(bytes);
		}).catch(() => {
			res.statusCode = 404;
			res.end("Not found");
		});
	};
	return {
		name: "dockit-assets",
		configureServer(server) {
			server.middlewares.use(handle);
		},
		configurePreviewServer(server) {
			server.middlewares.use(handle);
		},
	};
}

export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    watch: {
      ignored: ["**/data/**", "**/node_modules/**"],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 3000,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    securityHeaders(),
    dockitAssets(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: process.env.NITRO_PRESET || "node-server",
            routeRules: {
              "/**": { headers: SECURITY_HEADERS },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
