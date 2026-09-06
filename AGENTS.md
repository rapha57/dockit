# Dockit — AGENTS.md

## Project

Dockit is a self-hosted IT URL portal: a shared home page where teams gather links to the web tools and apps they actually use, organized by space, category and card. One instance, one JSON file (`data/portal.json`), **no database**. Public repo: `rapha57/dockit`.

The maintainer (Raphael) speaks **French** — respond in French. Code, identifiers, README and this file are in **English**.

## Setup

```bash
npm ci
npm run dev        # http://localhost:8080
npm run build
npm run typecheck
npm run lint
```

There is **no test suite or CI yet** — run `npm run typecheck` and `npm run build` to verify changes.

Production: Node 22, `PORTAL_EDIT_PASSWORD` required (≥ 12 chars, no default). The Docker image listens on port **3000**.

## How to work with Raphael

- **Propose, explain, then wait for GO** before touching any code — always. Even after explaining a fix, do not write code until he says « go ». Only exceptions: « code », « fais », « vire », « ajoute », « corrige ».
- **Never commit or push** unless asked. A commit is not a push. Often: « commit avant et go » means commit the current state **before** starting the next batch.
- Small, targeted diffs. No off-topic refactors, markdown files, or polish.
- For UI work: verify behavior (not just a screenshot), desktop and mobile when the layout changes.
- **i18n is important.** Every added string (labels, toasts, download filenames…) goes in `src/locales/en.json` **and** `fr.json`. Nothing hardcoded.

## Architecture

- Stack: React 19, TanStack Router / Start, Vite, Nitro, Tailwind 4, Zod, `jose` (OIDC), `ldapts`, lucide-react, sonner.
- Server: `createServerFn` + Zod. Every mutation goes through `mutate` / `withLock`.
- `src/routes/index.tsx` is very large and uses **JSX** — match its style. UI primitives live in `src/components/ui/` (shadcn-style with Dockit tokens). Do not reintroduce `jsx()` / `jsxs()`.
- Data model: `settings`, `customIcons`, `tabs[] → categories[] → apps[]`, `users`, `groups`, `roles`, `history`, `clickDays`, `lastTabId`.
- UI vocabulary: **Space / Category / Card** (FR: Espace / Catégorie / Carte). Never « tab » or « app » in user-facing copy — internally the JSON still uses `tabs` / `apps`.

## Persistence

Everything lives in `data/portal.json` (override: `PORTAL_DATA_FILE`). **No DB.**

`readDocUnlocked` keeps a `liveDoc` in memory. A running `npm run dev` process **rewrites the disk** with this cache — after manually editing the JSON, **restart the server**, otherwise the file reverts to the previous state.

Backup / move = copy the JSON. Treat it as a secret (scrypt hashes, OIDC secret, LDAP bind).

## Where to touch

| Topic | File |
| --- | --- |
| Persistence, settings, users, server fns | `src/lib/portal.ts` |
| ACL (`can`, roles, grants) | `src/lib/acl.ts` |
| Access UI (Users / Groups / Roles) | `src/components/access.tsx` |
| Portal, Settings, cards | `src/routes/index.tsx` |
| Dates / times / i18n runtime | `src/lib/i18n.ts` + `src/locales/*.json` |
| Card links | `src/lib/safe-href.ts` (http/https only) |
| GitHub version | `src/lib/release.ts` → `rapha57/dockit` |
| Styles | `src/styles.css` (`.am-*` prefixes for Access) |

## Product rules

- **Single product.** No Community / Business SKU, no license tiers. A possible « buy me a coffee » later is not a feature tier.
- Accounts: username + password. **No avatar, no email.**
- Local auth is **always** available, even with LDAP / OIDC. LDAP and Entra are not product editions.
- Groups exist in the JSON for a future AD. Do not invent a parallel model.
- Fresh install: **English** (`settings.locale = "en"`).
- Public README in English. Product copy: no employer, bank, or SSN-style content.
- GitHub seed: Home + Applications **empty**. The local demo `data/portal.json` is gitignored — never commit it.

## RBAC / Access

- System roles: `owner` / `admin` / `editeur` / `lecteur` (EN labels: Owner / Admin / Editor / Viewer).
- Effective access = union of direct grants + user roles + group roles + inheritance. `view` + `open` are implicit unless a node is restricted.
- **`move` ≠ `edit`** — no implicit implication, explicit grants only.
- Restore: an Editor restores **only** items within their rights (spaces they can edit); everything else is hidden. Admin / Owner restore everything.
- Access UI: **list → chevron → inline expansion**. Deletions use a **popup**. No black selection bar. Category drag ghost like cards.

## Security (by design)

Intranet + reverse proxy. In production: `PORTAL_EDIT_PASSWORD` ≥ 12, no default.

Already in place, keep it: scrypt, login rate limiting, ACL, OIDC PKCE, security headers, iframes without `allow-same-origin`, theme CSS without `url(` / `@import`, bounded probes (no cloud metadata).

Security settings (off by default, intranet): TLS probe verification, probes limited to sessions, HttpOnly session cookie.

Behind a proxy: `PORTAL_PUBLIC_ORIGIN` + `PORTAL_TRUST_PROXY=1`.

## UI / design conventions

- Instance formats: date (`ymd` YY/MM/DD, `yyyy` YYYY/MM/DD, `dmy`, `mdy`, `iso`), time `24h` / `12h`, IANA timezone or browser. These feed history, exports, and inventories — not cosmetic.
- Tags: 3 max per card, pastels (`src/lib/tag-colors.ts`).
- **Heights**: fields (`input` / `textarea` / `select`) and primary buttons (`Button`, Save) = **36px (`h-9`)**. The login screen is the reference (buttons = fields). Secondary constants: `am-create` (Access/History toolbars, secondary actions) = **32px**, `card-tool` (row actions) = **1.85rem**, `am-text-btn` (action links under fields) = **2rem**. Never put a 32px button next to a 36px field.
- **Edit forms (Space / Category / Card) follow the Settings grammar**: `.settings-card` blocks with `.settings-kicker`, field pairs via `.field-row`, header `title + lead`. No off-charte patterns (live preview, segmented control, inline icon inside a field).
- **Row actions = `card-tool`** (1.85rem square, 14px `size-3.5` icon) — consistent across spaces, categories, cards, tags, and history.
- History: Restore = `card-tool` button hover-revealed and vertically centered; « Empty trash » = a real `am-create` button; columns aligned between Audit and Recovery.
- **List tables (Access, History, Tags, any `.am-list`)**: never put `.am-list-head` inside the scroll area. Order is `.am-work` → `.am-toolbar` → `.am-list-head` (static, glued to the toolbar) → `.am-list-wrap` (overflow, **rows only**). Do **not** use `position: sticky` on the header — rows must not scroll under the search fields or through a 1px gap. Access uses `ListShell`’s `head` prop. Header height matches History: `.am-list-head .am-chevron-spacer { height: auto }` (spacers are width-only).
- **Edge fade**: `useEdgeFade` + `mask-image` on the **scroll container** (`.am-list-wrap`, `.settings-pane`, `.icon-pick-body`, `.note-scroll`). Never an overlay between header and rows. Fade top only after scroll, fade bottom only if more content below. Tables: header stays outside the scroller so the fade starts **below** the header border. `scrollbar-gutter: stable` + a solid mask strip on the gutter so the scrollbar does not fade.
- **Preview panels** (sample boxes in settings, e.g. Locales « Example »): a `settings-card` with a `settings-kicker`, inside a bordered rounded box like `SizePreview` (`border`, `radius-lg`, `elevated`-ish background), one labeled row per value (« Date: … », « Numbers: … » in `muted` label + `tabular-nums` value). The preview lives inside the section it illustrates, never as a separate banner at the top, and never a lone hint paragraph.
- Toasts: `sonner`. Destructive confirmations: `window.confirm` or Access popup, never a silent delete.

## Git & version

- Single branch: `main`.
- `data/portal.json` and `data/assets/` are gitignored.
- The `.githooks/pre-commit` hook updates `PORTAL_VERSION` in `src/routes/index.tsx` via `scripts/portal-version.sh`. Do not bypass it.
- About version check: GitHub releases `rapha57/dockit`. No release = no « offline » badge.