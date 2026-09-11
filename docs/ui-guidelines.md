# Dockit — UI Guidelines

Source of truth for building or modifying UI so it looks and behaves like the existing Dockit product.
Derived from the actual implementation (2026-09): `src/styles.css`, `src/components/`, `src/routes/index.tsx`, `src/lib/`.
When this file and the code disagree, the code wins — update this file.

---

## 1. Design tokens

**Rule.** All colors, radii and shadows come from CSS custom properties declared in `@theme` (`src/styles.css` top). Never hardcode a color in TSX; never invent a new token for a one-off.

**Canonical.** `src/styles.css` `@theme` block + `html.dark` override block.

**Tokens that matter.**

- Surfaces: `--color-bg`, `--color-surface` (cards, panels), `--color-elevated` (chips, secondary buttons, hovers), `--color-header`.
- Ink: `--color-fg` (main), `--color-muted` (secondary text), `--color-subtle` (hints, icons, placeholders).
- `--color-border`, `--color-primary` (+ `--color-primary-fg`), `--color-accent`, `--color-ring` (focus), `--color-danger`, `--color-ok`.
- `--color-navy` / `--color-fawn`: legacy aliases, avoid in new code.
- Radius: `--radius-sm 6px`, `md 8px`, `lg 12px`, `xl 16px`. Shadows: `--shadow-card`, `--shadow-card-hover`.
- Drag & drop fills: `--drop-fill/-hot/-line/-ink` (derived from surface).

**Usage.** Tailwind utilities map to tokens: `bg-surface`, `text-muted`, `text-subtle`, `border-border`, `ring-ring/60`, `text-fg`, `text-danger`, `bg-elevated`.

**Do.** Derive variants with `color-mix(in oklab, <token> N%, transparent)` (the codebase convention for tints).
**Don't.** Introduce raw hex in TSX; add a new global token without checking `@theme` first.
**Dark mode.** Only `html.dark` overrides values — components never branch on theme. The user-saved theme (`cssLight`/`cssDark` settings, sanitized by `theme-css.ts`, no `url(`/`@import`) is injected by `ThemeCss` and overrides defaults; the editor manages only `bg`/`surface`/`header` (`THEME_COLOR_FIELDS`, fallbacks `LIGHT_COLORS`/`DARK_COLORS` in `index.tsx`).

---

## 2. Typography

**Rule.** Small, dense UI. Titles are negative-tracked; hierarchy comes from size + weight + color tokens, not from large sizes.

**Reference values (styles.css).**

- Dialog title: `.dialog-title` — `1.05rem`, weight 600, tracking `-0.02em`. Every modal starts with it.
- List row title: `.am-row-title` — `0.8125rem`, weight 550, nowrap + ellipsis. Sub-line: `.am-row-sub`.
- Toolbar title: `.am-toolbar-title` — `0.8125rem`, weight 550.
- Column headers: `.am-list-head` — `0.6875rem`, uppercase, letter-spacing `0.05em`, color subtle.
- Kicker / section label: `.settings-kicker`; hints: `.settings-hint` (`.is-warn` for warnings); field meta: `.theme-css-meta`.
- Body copy in modals: `text-sm text-muted` (Tailwind).

**Do.** Use these classes instead of re-declaring font sizes.
**Don't.** Introduce font sizes not present in this scale; use font-weight > 600 in list UI.

---

## 3. Buttons

**Rule.** Two families: the `Button` React primitive (primary actions, dialogs) and small CSS action buttons (`card-tool`, `am-create`, `am-text-btn`) for inline/toolbar actions. Heights are part of a strict grammar.

**Height grammar (never mix 32px next to a 36px field):**

| Class / variant | Height | Use |
| --- | --- | --- |
| `Button` (`default` and `icon`) | **36px** (`h-9` / `size-9`) | Primary actions, dialog footers, header icons |
| `search-box` (header search) | **36px** (2.25rem) | Header search, hosts tag filter chips |
| `am-create` | **32px** (2rem) | Toolbar secondary actions (Access/History/Tags, « New », « Export ») |
| `am-text-btn` | **32px** | Text links under fields (Save key, delete link) |
| `card-tool` | **1.85rem**, icon `size-3.5` (14px) | Row actions everywhere: cards, categories, tags, history restore |

**Button variants.** `default` (bg-primary/primary-fg), `secondary` (elevated + border), `ghost` (muted → fg on hover), `danger` (danger/15 bg, danger text — destructive confirm OK), `outline`, `debug`. Sizes: `default` (`h-9 px-3`) and `icon` (`size-9`) only.
**Focus.** `focus-visible:ring-2 ring-ring/60`; active `scale-[0.98]`.

**Do.** Use `variant="secondary"` for Cancel, `danger` for destructive OK. Close / header icon buttons: `size="icon"`. Busy state = `disabled={busy}`.
**Don't.** Put `Button` (36px) inline with `am-create` (32px) in the same toolbar row; create a 40px+ button; add a new height or a `sm` / `icon-sm` alias.

---

## 4. Inputs, selects, textareas, fields

**Rule.** One shared field class: `inputClass` (`src/components/ui/input.tsx`) — `field-input h-9 rounded-md border border-border bg-transparent px-3 text-sm`, focus ring like buttons. `Input`, `Select`, `Textarea` all build on it.

**Canonical.** `src/components/ui/input.tsx` (`inputClass`), `ui/select.tsx` (wraps native `<select>` in `.select-wrap`; chevron is a CSS mask tinted with `--color-subtle`), `ui/textarea.tsx`. Icon inside a field: `.field-ico-wrap` wrapper. Size constants in forms: `FIELD_SM` (= `h-9`) in `index.tsx`, `.am-field` in Access. Raw card-type selects use `.kind-select` inside `.select-wrap` the same way.

**Field wrapper.** `Field` (`src/components/field.tsx`): optional `Label`, control, `hint` (`.theme-css-meta`), `error` (`.theme-css-meta.is-warn`). Label-less controls use `.settings-label` / first-span styling.

**Dependent controls.** When a checkbox gates another control — checkbox **or field** — the child gets `is-child` (`.settings-toggles label.is-child` / `.settings-field.is-child` → margin-left 1.6rem): the child starts at the parent's TEXT, forming a tree. Parent disabled → child also gets `is-disabled` (opacity, inputs disabled). Applies to every gated control whatever its type (Info stats under Info bar, probe blink under per-card probes, LDAP TLS verify under TLS, OIDC auto-redirect under OIDC, proxy-auth header under the proxy toggle).

**Identity block (Space/Category/Card forms).** The General tab opens with a two-column identity, each column headed by its own field label (standard `Label`, 13px muted — not a kicker): **Icon** (left) over the icon picker as a 44px dashed `brand-preview icon-trigger.is-header` button (icon at real card size, pencil badge on hover); **Name** (right) over the name input, with the **Category** label + select stacked underneath for cards. Gated controls (link-menu toggle…) stay inside the block. Description and Tags return to full width in their own kicked cards (GÉNÉRAL identity → DESCRIPTION → TAGS). The Link pane splits into LINK (list + menu toggle) and OPEN LINK (opening rule) blocks.

**Field labels.** `Label` (`src/components/ui/label.tsx`): **0.8125rem (13px), font-medium, `text-muted`** — same size as toggle labels, one step under the 11px kickers, never competing with the field value. Applies everywhere via the shared primitive (Settings, card forms, OIDC/LDAP forms).

**Do.** Use `Field` for any labeled control; `Select` (not raw `<select>`); keep every field 36px.
**Don't.** Inline icon inside the field via absolute positioning outside `.field-ico-wrap`; mix raw `<input class="field-input">` in new code when the primitive exists.

---

## 5. Forms & the Settings grammar

**Rule.** All forms (Settings panes, Space/Category/Card editors, Access forms) follow one structure — the **settings grammar**.

**Canonical.** `SettingsForm` / `AdminPanel` in `src/routes/index.tsx`; CSS `settings-*` in styles.css.

**Structure.**

```
settings-frame (is-wide, is-access for Access/History) 
└─ settings-body
   ├─ settings-head: title (dialog-title) + lead (settings-lead) + close Button (ghost icon)
   └─ EdgeFade.settings-pane (scroll area)
      └─ form > settings-stack
         ├─ settings-card × n (one concern each; name is historical — divider-separated blocks, no card chrome)
         │   ├─ settings-kicker (section label)
         │   ├─ settings-toggles (checkbox rows, min-height 2rem)
         │   └─ field-row (two Fields side by side ≥ 40rem)
         └─ settings-actions (footer, right-aligned, flex gap 0.5rem) → FormActions
```

**Do.** One `settings-card` per concern; `FormActions` (busy, optional onCancel, `form=` id) for the footer; brand/icon upload via `BrandPick` (`.brand-slot` + hidden file input).
**Don't.** Invent off-charte patterns: no live preview next to a field, no segmented controls, no inline icons inside fields, no per-form button styling.

---

## 6. Portal cards

**Rule.** A card is `.portal-card`: `rounded-xl bg-surface p-4 shadow-card`, hover `shadow-card-hover`. Grid: `.item-grid` — 1 column mobile, 2 (≥40rem), 3 (≥64rem); spans `item-span-2/3`, `item-h-1/2/3`; embeds `embed-h-*`.

**Canonical.** `AppCard` in `src/routes/index.tsx`.

**Anatomy.** `.card-main` (icon `.portal-mark` + title/description), `.card-corner` (absolute top-right: StatusMark, annex menu, FavStar, edit-mode tools), `.card-grip` (drag handle, visible on hover), `.card-tags` row. Note cards are `is-headless` when untitled; embeds render sandboxed iframes.

**Do.** Row/card actions go in `card-corner` or context menu (`.card-ctx`), never inline in the body.
**Don't.** Add shadows/borders other than the two shadow tokens.

---

## 7. Lists & tables (`.am-*`)

**Rule.** Every management list (Access, History, Tags, Identity sources) uses the same shell, in this order:

```
am-work
├─ am-toolbar: am-toolbar-title (left) · am-search · am-filters · am-create (right, margin-left auto)
├─ am-list-head   ← STATIC, outside the scroll area, uppercase column labels
└─ EdgeFade.am-list-wrap (the ONLY scroll area, rows only)
```

**Canonical.** `ListShell` + `ListHead` in `src/components/access.tsx`. Variants: `.am-list.is-history` (Audit/Recovery), `.is-tags`.

**Rows.** `ExpandRow` (`src/components/expand-row.tsx`) = `.am-row` (role listitem) with `.am-row-head` (min-height 2.35rem, focusable, click/Enter toggles) → chevron button, optional `.am-row-grip` (drag), `.am-row-cells` (title + sub, `.am-row-end` last column), expanded panel `.am-expand` (region) containing `settings-card`/`am-sec` blocks. Static rows: `.am-row.is-static`.

**Sorting.** `useColSort()` + `SortLabel` (`.am-sort`) in headers.
**Column alignment.** `.am-list.is-history` and `.is-tags` define matching cell widths for head + rows (see styles.css ~3111-3175). Keep head and row cell structure identical.

**Do.** Header stays outside the scroller (no sticky headers — rows must never scroll under it). Row height/padding from `.am-row-head`. Access uses `ListShell`’s `head` prop.
**Don't.** Put `.am-list-head` inside `EdgeFade`; use `position: sticky`; invent a new list layout per feature.

---

## 8. Row actions

**Rule.** One pattern: `card-tool` (1.85rem square, `size-3.5` icon, elevated bg on hover, `is-danger` hover for destructive) — everywhere (cards, categories, tags, history, providers).
**History Restore:** always-visible `card-tool` in its own trailing column (`.am-row-restore`), vertically centered — not behind a menu.
**Destructive actions** always confirm first (see §10).

---

## 9. Dialogs & modals

**Rule.** All overlays use `ModalShell` (`src/components/modal-shell.tsx`) — single portal on `document.body`, shared scroll-lock, nested layer stack for Escape (`pushLayer`), backdrop click closes. **No Radix Dialog.**

**Canonical.** `ModalShell`; `ConfirmDialog`/`askConfirm` (`src/components/confirm-dialog.tsx`).

**Sizes.** Default: centered, `max-w-lg max-h-[90dvh]`, `p-6`, scrollable. `size="wide"`: full Access/History/Admin frame (`max-h-[92dvh]`, internal panes scroll). Mobile: bottom sheet (`rounded-t-xl`, `items-end`).

**Modal content grammar.** `.dialog-title` → `mt-2 text-sm text-muted` body → `.settings-actions` footer (right: Cancel = `secondary`, OK = `default`/`danger`, both `disabled={busy}`).

**Two confirm patterns, both canonical:** `await askConfirm({ title, body, okLabel })` (promise, global `ConfirmHost`) for imperative flows; `<ConfirmDialog inline>` rendered inside an existing modal for in-dialog confirms (Access popups). Destructive = confirm, never silent.

---

## 10. Popovers & dropdown menus

**Rule.** Hand-rolled absolutely-positioned panels; close on outside `pointerdown` + Escape; no floating-ui/Radix.

**References.** `AccountMenu` (`.account-panel`), card context menu (`.card-ctx` + `.card-ctx-back`), tab overflow (`.tab-more-panel`), search suggestions (`.search-suggest`), tag palette (`.tag-palette`), Access pickers (`.am-picker-pop` with embedded `.am-search`).

**Do.** Menu items: `<button>` with icon `size-4` + label; separators via `.menu-sep`; section label via `.menu-kicker`/`.menu-title`.
**Don't.** Add a positioning library; nest native `<select>` for choice lists that need custom rows.

---

## 11. Toasts

**Rule.** `sonner` only, via `ThemedToaster` (`src/components/theme.tsx`): `position="top-center"`, `theme` follows app theme, toast class `bg-elevated text-fg border border-border`. Wrapped in `.portal-toaster` (excluded from context-menu dimming).
**Do.** `toast.success/t.error` with i18n keys; errors go through `te(err)`.
**Don't.** Use `alert()`/`confirm()`; render a custom toast component.

---

## 12. Tags, chips & badges

**Rule.** Three distinct chips:

- **`tag-chip`** — card tags & filters. Pastel from `tag-colors.ts` (`TAG_PASTELS`, 8 tones via `data-tone`, ink computed by `tagInk`); inline style `--tag-bg`/`--tag-fg` from `tagPaint()`. Max **3 per card**. `is-on` = filter active. Radius 999px, font 0.625rem/600.
- **`am-chip`** — Access row chips (grants, members); `am-chip-add` + `am-picker-pop` to add.
- **`count-chip` / `am-badge`** — counters and statuses.

**Do.** Always set both `--tag-bg` and `--tag-fg` via `tagPaint`; reuse `data-tone` for tone color.
**Don't.** Hardcode tag colors; exceed 3 tags/card.

---

## 13. Icons

**Rule.** `lucide-react` for UI icons; `PortalIcon` (`src/lib/icons.tsx`) for card/tab/category icons (resolves custom uploads → lucide name → favicon/iconify). Sizes: `size-3.5` row actions, `size-4` buttons/menus/toolbars, `size-3` tiny, `size-7` empty-state mark. Decorative icons get `aria-hidden`.

**Do.** `strokeWidth` default (2) except `ExpandRow` grips/chevrons (1.75).
**Don't.** Mix another icon library; use SVGs from icons.tsx for UI chrome.

---

## 14. Empty & loading states

**Empty.** `<EmptyState>` (`src/components/empty-state.tsx`): `.empty-page` (icon `size-7` in `.empty-page-mark`, line of text, optional action Button). `compact` inside panels/panes. In-list drops use `.empty-well`. Per-context icons: ScrollText (audit), Undo2 (recovery), Layers default.

**Loading.** `<Skeleton className="h-9 w-full" />` rows inside `.am-list` with `aria-busy="true"` (see HistoryPanel). Long ops: disable triggers with `busy`. No spinners.

---

## 15. Navigation

**Rule.** Top header = `.tab-row`: `.tab-strip` (scrollable tab list) + `.tab-row-end` (search, theme toggle, account). Tabs are `.tab-item` (icon + optional label, `is-on` active, drag-reorderable with `GripVertical`); overflow tabs move to `.tab-more-panel` under `.tab-more-wrap`.

**Do.** New header actions go in `.tab-row-end` as `Button variant="ghost" size="icon-sm"` with `aria-label` + `title`.
**Don't.** Add a second nav layer on the portal page; make tabs non-icon-only without checking `hideLabel` handling.

---

## 16. Access management UI

**Rule.** Access lives in the `size="wide"` modal (`AccessFrame`, `src/components/access.tsx`): left `settings-nav` (sections), right `settings-pane is-access` hosting `ListShell` lists.

**Patterns.** Users/Groups/Roles/Identity: `ListShell` + `ExpandRow` inline expansion (chevron), `useExpandSession` for open/dirty/close-confirm state; deletions via `ConfirmPopup` (Access popup), not silent; identity providers reuse `settings-card` forms (`OidcForm`, `LdapDirFields`) inside `.am-expand`; permission editing via `.perm-matrix` switches / `.am-perm` blocks.

**Do.** Reuse `ListShell`, `useExpandSession`, `ConfirmPopup`; keep column cells aligned with `.am-list-head`.
**Don't.** Route users to separate pages; put forms outside the expansion row.

---

## 17. History UI

**Rule.** `HistoryPanel` (`src/routes/index.tsx`): panes Audit / Recovery switched by `.am-filters` pills; `ListShell` with `is-history` (and `is-recovery`) variants; loading = Skeleton rows; empty = `EmptyState compact`; CSV export / purge = `am-create` buttons in `.am-toolbar`.

**Do.** Keep Audit and Recovery columns aligned (shared cell template in styles.css); Restore = `card-tool` in trailing `.am-row-action` column (Recovery only).
**Don't.** Add pane-specific column layouts that break the shared head.

---

## 18. Responsive & mobile

**Rule.** Mobile-first; only `min-width` breakpoints: **40rem** (sm: side-by-side fields, centered modal, settings-nav rail) and **64rem** (lg: 3-column grid). No `max-width` queries in styles.css.

**Do.** Bottom-sheet modals on mobile (ModalShell default); `.tab-strip` scrolls horizontally; drag handles use `touch-none` + pointer events.
**Don't.** Add desktop-only layouts that hide content on mobile; use `hidden sm:block` for essential controls.

---

## 19. Scrolling & edge fades

**Rule.** Any scrollable panel uses `EdgeFade` (`src/components/edge-fade.tsx`): host `.edge-fade` + scroller `[data-edge-scroll]`. Fade = 2.75rem linear gradient to `--color-surface`; top fade (`::before`, glued to header via `top: -1px`) appears only after scrolling (`is-fade-top`); bottom fade is a sticky `::after`, visible only when more content exists (`is-fade-bottom`). Native scrollbars (macOS overlay paints above the fade). No `scrollbar-gutter` on fade panes; no masks, no scroll libraries.

**Do.** Keep the scroll container as the single `data-edge-scroll` element (panes, am-list-wrap, note-scroll, icon-pick-body).
**Don't.** Wrap lists in nested scrollers; add padding to "compensate" the fade.

---

## 20. Previews

**Rule.** Sample/preview panels (Locales « Example », card-size preview) follow the settings grammar: a `settings-card` with `settings-kicker` inside the section it illustrates, content in a bordered rounded box (`.size-preview` / `.lang-sample`), one labeled row per value (label `muted`, value `tabular-nums`).

**Don't.** Put a preview banner at the top of the pane or a lone hint paragraph.

---

## Known inconsistencies (do not "fix" silently)

1. **`Button` + `className="am-create"`** — plain `<button className="am-create">` is canonical for toolbar/secondary actions (32px); `Button` (36px) is for primary/dialog actions only. `Empty trash`-style destructive actions may use `Button variant="danger" + am-create` (32px soft-danger).
2. **`settings-card`** is transparent/borderless (divider-separated) despite the name — the "card" look comes from the pane, don't add borders.

---

## Quick reference — adding a new screen

- Management list → `ListShell` + `ExpandRow` (+ `EmptyState`, Skeleton, `am-create` toolbar).
- Form/editor → settings grammar (§5), `FormActions` footer, i18n keys in `en.json` **and** `fr.json`.
- Confirmation → `askConfirm` (imperative) or inline `ConfirmDialog` (in-modal).
- New panel in the Admin modal → section in `settingsSections()` + `settings-pane` with `EdgeFade`.
