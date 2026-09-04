# Dockit — pratiques pour l’agent

Portail d’URLs IT auto-hébergé. Une instance, un fichier JSON, pas de base. Le dépôt public est `rapha57/dockit`.

Travailler dans `/Users/raphael/Documents/Developpement/dockit`. L’ancien dossier `dashboard-it` n’est plus le projet.

## Comment travailler avec Raphael

- Parler **français**. Code, identifiants et README en **anglais**.
- **Proposer, puis attendre GO** — sauf s’il dit clairement « code », « fais », « vire », « ajoute ».
- **Ne pas committer ni pousser** sans qu’il le demande. Un commit ≠ un push.
- Petites diffs, ciblées. Pas de refacto, de fichier markdown ou de « polish » hors sujet.
- UI web : vérifier le comportement (pas seulement un screenshot), desktop et mobile si le layout change.

## Produit

- **Un seul produit.** Pas de SKU Community / Business, pas de licence. Un « buy me a coffee » éventuel, plus tard, n’est pas un palier de fonctionnalités.
- Vocabulaire UI : **Space / Category / Card** (FR : Espace / Catégorie / Carte). Pas « tab » ni « app » dans le copy utilisateur — en interne le JSON parle encore de `tabs` / `apps`.
- Comptes : identifiant + mot de passe. **Pas d’avatar, pas d’e-mail.**
- Auth locale **toujours** disponible, même avec LDAP / OIDC. LDAP et Entra ne sont pas des éditions du produit.
- Les groupes existent dans le JSON pour un AD plus tard. Ne pas inventer un modèle parallèle.
- Install neuve : **anglais** (`settings.locale = "en"`). Chaînes dans `src/locales/en.json` **et** `fr.json` à chaque ajout.
- README public en anglais. Copy produit : pas de noms d’employeur, de banque, ni de NAS grand public.
- Seed GitHub : Home + Applications **vides**. Une démo locale dans `data/portal.json` est gitignorée ; ne jamais la committer.

## Données

Tout vit dans `data/portal.json` (surcharge : `PORTAL_DATA_FILE`). **Pas de DB.**

`readDocUnlocked` garde un `liveDoc` en mémoire. Un process `npm run dev` déjà lancé **réécrit le disque** avec ce cache. Après un edit manuel du JSON : **redémarrer le serveur**, sinon le fichier revient à l’ancien état.

Sauvegarder / déplacer = copier ce JSON. Le traiter comme un secret (hashes scrypt, secret OIDC, bind LDAP).

## Où toucher

| Sujet | Fichier |
| --- | --- |
| Persist, settings, users, server fns | `src/lib/portal.ts` |
| ACL (`can`, rôles, grants) | `src/lib/acl.ts` |
| UI Access (Users / Groups / Roles) | `src/components/access.tsx` |
| Portail, Settings, cartes | `src/routes/index.tsx` |
| Dates / heures / i18n runtime | `src/lib/i18n.ts` + `src/locales/*.json` |
| Liens cartes | `src/lib/safe-href.ts` (http/https seulement) |
| Version GitHub | `src/lib/release.ts` → `rapha57/dockit` |
| Styles | `src/styles.css` (préfixes `.am-*` pour Access) |

`index.tsx` est volumineux ; il est en JSX. Matcher ce style. Primitives : `src/components/ui/`.

Server : `createServerFn` + Zod. Toute mutation passe par `mutate` / `withLock`.

## Accès (RBAC)

- Rôles système : `owner` / `admin` / `editeur` / `lecteur` (labels EN : Owner / Admin / Editor / Viewer).
- Effective access = union grants directs + rôles user + rôles de groupes + héritage. `view` + `open` implicites si le nœud n’est pas restricted.
- **`move` ≠ `edit`.**
- Access = **liste → chevron → expansion inline**. Suppressions = **popup**. Pas de barre de sélection noire. Ghost de drag catégories comme pour les cartes.
- `index.tsx` est en JSX. Primitives UI dans `src/components/ui/` (shadcn-style, tokens Dockit). Ne pas réintroduire `jsx()`/`jsxs()`.

## Sécurité (by design)

Intranet + reverse proxy. En prod : `PORTAL_EDIT_PASSWORD` ≥ 12, pas de défaut.

Déjà en place, à conserver : scrypt, rate limit login, ACL, OIDC PKCE, headers, iframes sans `allow-same-origin`, CSS thème sans `url(` / `@import`, probes bornées (pas de metadata cloud).

Réglages Security (off par défaut, intranet) : vérif TLS probes, probes réservées aux sessions, cookie HttpOnly.

Derrière un proxy : `PORTAL_PUBLIC_ORIGIN` + `PORTAL_TRUST_PROXY=1`.

## UI / locales

- Formats d’instance : date (`ymd` YY/MM/DD, `yyyy` YYYY/MM/DD, `dmy`, `mdy`, `iso`), heure `24h` / `12h`, fuseau IANA ou navigateur. Ça alimente historique, exports, inventaires — pas un format « cosmétique ».
- Tags : 3 max par carte, pastels (`src/lib/tag-colors.ts`).
- Toasts : `sonner`. Confirmations destructives : `window.confirm` ou popup Access, pas un delete silencieux.

## Git et version

- Branche unique : `main`.
- `data/portal.json` et `data/assets/` sont gitignorés.
- Le hook `.githooks/pre-commit` met à jour `PORTAL_VERSION` dans `src/routes/index.tsx` via `scripts/portal-version.sh`. Ne pas le contourner.
- Check de version About : releases GitHub `rapha57/dockit`. Repo sans release = pas de badge « hors ligne ».

## Commandes

```bash
npm ci
npm run dev          # :8080
npm run build
npm run typecheck
```

Prod Node 22 : `PORTAL_EDIT_PASSWORD` obligatoire. Docker : port **3000**.
