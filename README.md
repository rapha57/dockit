<p align="center">
  <img src="public/logo.svg" width="64" alt="Dockit" />
</p>

<h1 align="center">Dockit</h1>

<p align="center"><strong>Your team's internal launchpad.</strong></p>

<p align="center">
  Keep the tools, consoles, dashboards and internal apps your team uses every day in one place.
  <br />
  Self-hosted. One JSON file. No database.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111" alt="React 19" />
  <img src="https://img.shields.io/badge/TanStack_Start-FF4154?style=flat-square&logo=reactquery&logoColor=white" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/license-MIT-2EA043?style=flat-square" alt="MIT" />
  <a href="https://github.com/rapha57/dockit/actions/workflows/ci.yml">
    <img src="https://github.com/rapha57/dockit/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
</p>

<p align="center">
  <img src="screenshots/screen_001.png" alt="Dockit portal with spaces, categories and cards" />
</p>

## Why Dockit?

IT teams rely on dozens of tools every day: monitoring, ticketing, IAM, cloud consoles, infrastructure, internal applications, documentation and more.

Over time, the links end up scattered across browser bookmarks, tabs, chat messages and emails.

**Dockit gives your team one shared place to find them.**

A new team member shouldn't have to ask:

> “Where's the link to Grafana?”  
> “What's the Kubernetes console URL?”  
> “Where do I find the ITSM?”

Put the links in Dockit once. Keep them organised. Make Dockit the browser start page, or deploy it to workstations with tools such as Windows GPO.

**One place to start. Everything your team needs, already organised.**

## What Dockit is

Dockit is a lightweight, self-hosted portal for organising internal tools and URLs.

The hierarchy is deliberately simple:

```text
Space
 └── Category
      └── Card
           ├── Link
           ├── Note
           └── Embed
```

A **Space** is a home page for a context, team or environment.

A **Category** groups related cards.

A **Card** represents an application, service, note or embedded page. Cards can contain multiple links when a tool exposes several entry points.

Dockit doesn't replace your existing tools. It sits in front of them:

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

## Features

| Feature | Description |
| --- | --- |
| **Spaces / categories / cards** | Organise your portal with drag and drop |
| **Link hub** | Put multiple URLs on a single card (`https://`, `ssh://`, `ftp://`, …) |
| **Probes** | Check HTTP and ICMP availability from the server |
| **Curation** | Periodically verify that card links still work |
| **Access control** | Users, groups, roles and grants |
| **History** | Audit changes and restore previous versions |
| **Reports** | Export audit and inventory data as CSV / PDF |
| **Authentication** | Local accounts, LDAP / Active Directory and OIDC |
| **Customisation** | Light / dark mode, logo, favicon and tags |
| **Import / export** | Export or restore the whole portal, or a single space |
| **Icons** | Built-in and custom icons |
| **Single-file storage** | No database — the portal lives in `portal.json` |

## Quick start

### Development

Requires Node.js 22.

```bash
npm ci
npm run dev
```

Open **http://localhost:8080**.

Development credentials:

```text
admin / admin
```

> The default credentials are for development only.

The pre-commit hook runs `typecheck` and `lint` with zero warnings.

### Docker

Set `PORTAL_EDIT_PASSWORD` to a password of at least 12 characters in `docker-compose.yml`.

The container listens on port **3000** and stores persistent data in the `portal-data` volume.

The image uses a two-stage build: build dependencies stay in the builder stage, while the production image installs only production dependencies and the generated `.output`.

The `data/` directory is intentionally excluded from the image.

```bash
docker pull ghcr.io/rapha57/dockit:latest
docker compose up -d --build
```

Each GitHub release publishes:

```text
ghcr.io/rapha57/dockit:<tag>
ghcr.io/rapha57/dockit:latest
```

and a CycloneDX SBOM (`dockit-<tag>.cdx.json`) on the release.

To make the GitHub Container Registry package public for the first time:

**GitHub → Packages → dockit → Change visibility → Public**

### Reverse proxy

When Dockit is behind a reverse proxy, configure its public origin and trust the proxy headers:

```bash
PORTAL_PUBLIC_ORIGIN=https://portal.example
PORTAL_TRUST_PROXY=1
```

Use HTTPS in production.

### Production

`PORTAL_EDIT_PASSWORD` is required in production and has no default value.

A typical deployment behind an internal reverse proxy:

```bash
npm ci

export PORTAL_EDIT_PASSWORD="a-real-password"
export NITRO_PRESET=node-server

npm run build
node .output/server/index.mjs
```

## Kubernetes / OpenShift

HTTP probes require no additional capabilities.

ICMP probes use `NET_RAW`.

The default OpenShift `restricted` SCC does not grant this capability. You can therefore:

- omit `cap_add` and leave ICMP probes disabled, or
- use a dedicated SCC that grants `NET_RAW`.

HTTP probes continue to work without `NET_RAW`.

Mount `/app/data` as persistent storage. Do not bake `portal.json` into the container image.

## Curation

A portal that is never maintained eventually becomes a graveyard of broken links.

Services get renamed. Hosts are retired. Paths move behind a reverse proxy. The bookmark remains.

Once you have enough links, nobody is going to open every one of them every day.

**Curation answers a simple question: do the links in this portal still work?**

From the account menu, Dockit can check every card link — both the primary URL and additional URLs.

The curation view provides:

- Live progress
- A step-by-step execution log
- HTTP success and redirect results
- Redirect targets
- HTTP errors
- Timeouts
- Unreachable hosts
- Per-card results to quickly identify broken entries
- A direct **Edit** action to fix a card

Checks run server-side, so they are not affected by browser CORS restrictions.

The probe system includes shared timeouts, SSRF protections and rate limiting.

Results are stored in:

```text
data/curation.json
```

Curation is available to administrators and editors.

## Access control

Dockit supports:

- Local users
- Groups
- Roles
- Grants
- LDAP / Active Directory
- OIDC

Local login always remains available, even when LDAP or OIDC is configured.

OIDC users can inherit Dockit roles from their identity-provider groups.

## OIDC groups

Go to:

**Settings → Sign-in → Scopes**

The default scopes are:

```text
openid profile email
```

To map OIDC groups to Dockit groups, request the `groups` claim as well:

```text
openid profile email groups
```

Providers such as Pocket ID, Authentik and Keycloak generally require the groups scope before including group membership in the token.

After the user's next sign-in, claimed groups appear under:

**Access → Groups**

Assign a Dockit role to the group and its members inherit that role.

`openid` is always requested regardless of what is entered in the scopes field.

## LDAP / AD bind secrets

There are two ways to configure LDAP and OIDC secrets. Neither is mandatory.

### Store secrets in Dockit

Go to:

**Settings → Sign-in**

Paste the OIDC client secret and LDAP bind password as usual.

Dockit stores them in `portal.json`.

This is convenient on a trusted server and is the default behaviour when no environment variable is configured.

### Store secrets in the environment

Alternatively, provide the secrets through environment variables.

For OpenShift or Kubernetes, use a Secret.

```bash
export PORTAL_OIDC_CLIENT_SECRET="…"
export PORTAL_LDAP_BIND_PASSWORD="…"
```

When a secret is provided through the environment, its field in Settings is greyed out and marked as being managed by the server.

The next save writes that field as empty in `portal.json`.

An existing value already stored in the file continues to work until the configuration is saved again.

### Multiple LDAP directories

If all configured LDAP directories use the same bind password, the generic variable is enough:

```text
PORTAL_LDAP_BIND_PASSWORD
```

That password is used for every configured directory.

If different directories use different bind accounts, do **not** set the generic variable.

Instead, define one variable per directory using its directory ID.

For example:

```text
id: ad
→ PORTAL_LDAP_BIND_PASSWORD_AD
```

```text
id: corp-emea
→ PORTAL_LDAP_BIND_PASSWORD_CORP_EMEA
```

For UUID-based IDs, hexadecimal characters are preserved, hyphens are replaced with underscores, and the result is uppercased.

The directory-specific variable takes precedence over the generic variable.

Local Dockit user passwords are unaffected. They remain hashed in `portal.json`.

## Data

Dockit has **no database**.

The portal is stored in a single JSON file:

```text
data/portal.json
```

Backup, migration and restore are therefore straightforward: copy the file.

You can override its location with:

```bash
PORTAL_DATA_FILE=/path/to/portal.json
```

Treat the file as sensitive data. It contains password hashes and access-control information.

If SSO or LDAP bind secrets are supplied through environment variables, restoring Dockit requires both:

- the JSON file
- the corresponding environment variables

If the secrets were entered through Settings, they are already stored in the JSON file.

### Data layout

| Path | Contents |
| --- | --- |
| `data/portal.json` | Portal configuration and content |
| `data/curation.json` | Curation / link-check results |
| `data/assets/` | Uploaded portal assets |
| `public/icons/` | Built-in icons |

## Security

Dockit is designed for **internal networks**, typically behind a reverse proxy.

It is not intended to be exposed directly as a public SaaS application.

### Threat model

Dockit's attack surface is primarily the portal process and whatever the reverse proxy exposes.

The server-side probe system is deliberately restricted:

- Cloud metadata endpoints such as `169.254.169.254` are blocked
- Link-local targets are blocked
- HTTP probes are limited to `http://` and `https://`
- Embedded credentials are not allowed in probe URLs
- DNS resolution is checked
- Requests have a maximum timeout of 4 seconds
- Probes are rate-limited
- Probes can be restricted to signed-in sessions
- ICMP probing is optional and requires `NET_RAW`
- Production requires `PORTAL_EDIT_PASSWORD` with at least 12 characters
- There is no default production edit password

### Application security

Dockit also uses:

- `scrypt` password hashing
- Login rate limiting
- Access-control lists
- OIDC PKCE
- Security headers
- Restricted iframe permissions
- Theme CSS filtering against `url(` and `@import`
- HttpOnly session cookies when enabled
- TLS certificate verification controls for probes
- A non-root Docker container running as the `node` user

For the full configuration, see **Settings → Security**.

## Import and export

Dockit can export:

- the complete portal
- an individual space
- inventory data
- audit data

Exports can be used for backups, migrations or moving a space between environments.

## Stack

- React 19
- TanStack Start
- Vite 8
- Tailwind CSS 4
- Nitro
- JSON file storage

## License

MIT
