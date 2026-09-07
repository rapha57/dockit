<p align="center">
  <img src="public/logo.svg" width="72" alt="Dockit" />
</p>

<h1 align="center">Dockit</h1>

<p align="center">
  <strong>The shared home page for your IT tools.</strong>
</p>

<p align="center">
  One dashboard for the tools your team uses every day.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111" alt="React 19" />
  <img src="https://img.shields.io/badge/TanStack_Start-FF4154?style=flat-square&logo=reactquery&logoColor=white" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Nitro-00DC82?style=flat-square&logo=nitro&logoColor=white" alt="Nitro" />
  <img src="https://img.shields.io/badge/build-passing-2EA043?style=flat-square&logo=githubactions&logoColor=white" alt="Build passing" />
</p>

---

## Why Dockit?

IT engineers use dozens of tools every day: infrastructure consoles, monitoring, ticketing, IAM, cloud platforms, internal applications, documentation and more.

Those links tend to end up scattered across bookmarks, browser tabs, chat messages and emails.

**Dockit brings them together in one shared, structured dashboard.**

A new engineer joining the team doesn't need to ask:

> "Where's the link to Grafana?"
> "What's the URL for the Kubernetes console?"
> "Where do I find the ITSM?"

It's already there.

Dockit can be used as a team's browser start page, or deployed centrally and pushed to workstations through tools such as **Windows GPO**.

**One place to start. Everything already organised.**

---

## Features

* **Spaces** — Organise tools by team or domain: Infrastructure, Systems, Security, Development…
* **Cards** — Applications, Markdown notes and embeds
* **Drag & drop** — Keep spaces and categories organised
* **Probes** — HTTP and ICMP availability directly on cards
* **Access control** — Users, groups, roles and granular ACLs
* **Audit & recovery** — Full change history with restore for spaces, categories and cards
* **Reports** — Audit trail as CSV; card inventory as CSV and PDF
* **Authentication** — Local accounts, LDAP / Active Directory and OIDC
* **Themes** — Light / dark mode, logo, favicon and tags
* **Import / export** — Move or back up the entire portal as one JSON file
* **Icons** — Built-in and custom icons

---

## A shared front door for your tools

Dockit doesn't replace your existing systems.

It sits in front of them:

```text
                         Dockit
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   Infrastructure        Systems           Security
        │                  │                  │
   Grafana              GitLab             Keycloak
   Proxmox              ITSM               IAM
   Kubernetes           Wiki               SIEM
   Cloud                DNS                ...
```

The tools stay where they are.

**Dockit gives your team one consistent way to reach them.**

---

## Data

No database.

The complete portal is stored in:

```text
data/portal.json
```

This makes the portal easy to back up, version, move or restore.

Override the location with:

```bash
PORTAL_DATA_FILE=/path/to/portal.json
```

---

## Getting started

```bash
npm ci
npm run dev
```

The development server listens on `http://localhost:8080`.

A pre-commit hook runs `typecheck` and `lint` (zero warnings) on every commit, and the TypeScript build is expected to pass clean.

Default development credentials:

```text
admin / admin
```

> Development only. Production requires `PORTAL_EDIT_PASSWORD` with a minimum of 12 characters.

---

## Docker

Configure `PORTAL_EDIT_PASSWORD` in `docker-compose.yml`, then:

```bash
docker compose up -d --build
```

Dockit listens on port `3000`.

For a reverse proxy deployment:

```bash
PORTAL_PUBLIC_ORIGIN=https://portal.example
PORTAL_TRUST_PROXY=1
```

Persistent data is stored in the `portal-data` Docker volume.

---

## Production

Requires **Node.js 22**.

```bash
npm ci

export PORTAL_EDIT_USER="admin"
export PORTAL_EDIT_PASSWORD="a-real-password"
export NITRO_PRESET=node-server

npm run build
node .output/server/index.mjs
```

---

## Security

Dockit is designed for internal environments and trusted networks, typically behind a reverse proxy.

Production deployments should use:

* A strong `PORTAL_EDIT_PASSWORD`
* HTTPS
* A protected `data/portal.json`

Security features include:

* scrypt password hashing
* Login rate limiting
* Roles and ACLs
* OIDC with PKCE and ID token verification
* Security HTTP headers
* Restricted iframe handling
* Bounded probes
* Non-root Docker image
* HttpOnly session cookies

Additional options are available under **Settings → Security**.

---

## Stack

| Layer                 | Technology     |
| --------------------- | -------------- |
| UI                    | React 19       |
| Application / routing | TanStack Start |
| Build                 | Vite 8         |
| Styling               | Tailwind CSS 4 |
| Runtime               | Nitro          |
| Validation            | Zod            |
| Icons                 | Lucide         |
| Persistence           | JSON           |

---

## Useful paths

| Path               | Purpose               |
| ------------------ | --------------------- |
| `data/portal.json` | Complete portal data  |
| `public/icons/`    | Built-in icon library |
| `public/logo.svg`  | Dockit logo           |
