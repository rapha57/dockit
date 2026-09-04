<p align="center">
  <img src="public/logo.svg" width="72" alt="Dockit" />
</p>

<h1 align="center">Dockit</h1>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111" alt="React 19" />
  <img src="https://img.shields.io/badge/TanStack_Start-FF4154?style=flat-square&logo=reactquery&logoColor=white" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Nitro-00DC82?style=flat-square&logo=nitro&logoColor=white" alt="Nitro" />
  <img src="https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white" alt="Zod" />
  <img src="https://img.shields.io/badge/Lucide-F56565?style=flat-square&logo=lucide&logoColor=white" alt="Lucide" />
</p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=react,vite,tailwind,ts,nodejs,docker" alt="React, Vite, Tailwind, TypeScript, Node.js, Docker" height="32" />
</p>

<p align="center"><strong>Pin your URLs</strong></p>

At work, everyday tools are scattered: infrastructure consoles, HR portals, ticketing, IAM, monitoring, business apps — often stuck in a bookmark or an email. Dockit is a shared home page. You gather links to the web tools and apps teams actually use, and you organise them by space (infra, systems, business…).

Everything lives in a JSON file (`data/portal.json`). No database: copy that file to back up or move the portal.

The UI language defaults to **English**. You can switch it later in Settings.

---

## Features

- **Spaces** — Tabs, categories, cards; drag and drop to organise
- **3 card types** — Application, Markdown note, embed
- **Probes** — HTTP or ICMP availability, live on the card
- **Access** — Users, groups, roles; granular permissions on spaces, categories and cards
- **Sign-in** — Local accounts, LDAP / Active Directory, OIDC (Keycloak and other IdPs)
- **Themes** — Light / dark CSS, logo, favicon, coloured tags
- **Import / export** — One JSON to move or restore everything
- **Icons** — Built-in library plus custom icons

---

## Getting started

```bash
npm ci
npm run dev
```

The portal listens on [http://localhost:8080](http://localhost:8080).

Default editor credentials (dev): `admin` / `admin`.  
In production: `PORTAL_EDIT_PASSWORD` is required, 12 characters min.

---

## Docker

```bash
# 1. Edit docker-compose.yml: PORTAL_EDIT_PASSWORD (12 characters min.)
# 2. Start
docker compose up -d --build
```

The portal listens on port **3000**.  
Reverse proxy (nginx / Traefik / IIS ARR) to `http://127.0.0.1:3000`.

In production, `PORTAL_EDIT_PASSWORD` is required (not `admin` / `change-moi`).  
Behind a reverse proxy: `PORTAL_PUBLIC_ORIGIN=https://portal.example` and `PORTAL_TRUST_PROXY=1`.

Backup = Docker volume `portal-data`, or the file  
`/var/lib/docker/volumes/.../portal.json`.

---

## Node in production

Requires Node.js 22.

```bash
npm ci
export PORTAL_EDIT_USER="admin"
export PORTAL_EDIT_PASSWORD="a-real-password"   # 12 characters min.
export NITRO_PRESET=node-server
npm run build
node .output/server/index.mjs
```

The JSON is created on first run in `data/portal.json`  
(override with `PORTAL_DATA_FILE`).

---

## Reverse proxy

```nginx
server {
  listen 443 ssl;
  server_name portal.internal.local;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

---

## Security

Built for internal use (trusted network, reverse proxy). In production: a strong `PORTAL_EDIT_PASSWORD` (12 characters min.), HTTPS, and treat `data/portal.json` as a secret (password hashes and OIDC secret).

Already in place: scrypt, login rate limiting, roles + ACL, OIDC (PKCE + id_token verification), HTTP headers, iframes without `allow-same-origin`, theme CSS without `url(` / `@import`, bounded probes (ID, quota, no cloud metadata), non-root Docker image.

In **Settings → Security** (admin): probe TLS verification, probes limited to signed-in users, HttpOnly session cookie. Off by default (intranet).

Behind a reverse proxy: set `Host` / `X-Forwarded-*` on the proxy, then `PORTAL_PUBLIC_ORIGIN` and `PORTAL_TRUST_PROXY=1`.

---

## Stack

| Layer             | Technology         |
| ----------------- | ------------------ |
| UI                | React 19           |
| App / routing     | TanStack Start     |
| Build             | Vite 8             |
| Styles            | Tailwind CSS 4     |
| Server runtime    | Nitro              |
| Validation        | Zod                |
| UI icons          | Lucide             |
| Persistence       | `data/portal.json` |

---

## Roadmap

- **Modules** — Optional extensions, so extra features can plug in without bloating the core

---

## Useful paths

| Path | Role |
| ---- | ---- |
| `data/portal.json` | The whole portal (tabs, cards, themes, accounts) |
| `public/icons/` | Built-in icon library |
