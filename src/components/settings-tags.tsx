import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { EdgeFade } from "@/components/edge-fade";
import { askConfirm } from "@/components/confirm-dialog";
import { useColSort, SortLabel } from "@/components/access";
import { t, tp } from "@/lib/i18n";
import { TAG_PALETTE, defaultTagHex, remapTagHex, tagInk } from "@/lib/tag-colors";
import { FIELD_SM, type SettingsPayload, type TagsPayload } from "@/lib/portal-ui";
import { lookupTagColor } from "@/lib/tag-ui";
import { expandHex } from "./settings-theme";

export function TagColorPick({
  hex,
  name,
  disabled,
  onChange,
}: {
  hex: string;
  name: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    top: 0,
    left: 0,
  });
  const current = remapTagHex(hex);
  const ink = tagInk(current);
  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 196;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const top = r.bottom + 6 + 168 > window.innerHeight ? r.top - 174 : r.bottom + 6;
    setPos({
      top,
      left,
    });
  }
  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: PointerEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="picker-color-btn"
        disabled={disabled}
        style={
          {
            ["--tag-bg"]: current,
            ["--tag-fg"]: ink,
          } as CSSProperties
        }
        title={t("tags.colorOf", {
          name,
        })}
        aria-label={t("tags.colorOf", {
          name,
        })}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="tag-palette"
              role="listbox"
              aria-label={t("tags.palette")}
              style={{
                top: pos.top,
                left: pos.left,
              }}
            >
              {TAG_PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="option"
                  className={`tag-palette-dot${swatch === current ? " is-on" : ""}`}
                  style={
                    {
                      ["--tag-bg"]: swatch,
                      ["--tag-fg"]: tagInk(swatch),
                    } as CSSProperties
                  }
                  aria-selected={swatch === current}
                  aria-label={t("tags.pickColor")}
                  title={swatch}
                  onClick={() => {
                    onChange(swatch);
                    setOpen(false);
                  }}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
export function TagManager({
  tags,
  colors,
  busy,
  value,
  onChange,
  onSave,
  onApply,
}: {
  tags: { name: string; count: number }[];
  colors: Record<string, string>;
  busy: boolean;
  value: SettingsPayload;
  onChange: (patch: Partial<SettingsPayload>) => void;
  onSave: () => void;
  onApply: (payload: TagsPayload) => void;
}) {
  const prune = value.pruneOrphanTags;
  const alpha = value.tagsAlpha;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [createDraft, setCreateDraft] = useState("");
  const col = useColSort();
  const sortedTags = col.apply(tags, (row, key) => {
    if (key === "name") return row.name || "";
    if (key === "count") return row.count || 0;
    return "";
  });
  const [localColors, setLocalColors] = useState(colors ?? {});
  useEffect(() => {
    setLocalColors(colors ?? {});
  }, [colors]);
  function createTag() {
    const name = createDraft.trim().slice(0, 32);
    if (!name || busy) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error(t("tags.exists"));
      return;
    }
    if (tags.length >= 80) {
      toast.error(t("tags.tooMany"));
      return;
    }
    setCreateDraft("");
    onApply({
      create: [name],
    });
  }
  function renameTag(from: string, to: string) {
    const next = String(to || "")
      .trim()
      .slice(0, 32);
    if (!next || next === from || busy) return;
    onApply({
      rename: [
        {
          from,
          to: next,
        },
      ],
    });
  }
  async function removeTag(name: string) {
    if (
      !(await askConfirm({
        title: t("actions.delete"),
        body: t("confirm.deleteTag", { name }),
      }))
    )
      return;
    onApply({
      remove: [name],
    });
  }
  function changeColor(name: string, hex: string) {
    const next = remapTagHex((expandHex(hex) ?? String(hex || "")).toLowerCase());
    if (!/^#[0-9a-f]{6}$/.test(next)) return;
    setLocalColors((cur) => ({
      ...cur,
      [name]: next,
    }));
    onApply({
      colors: {
        [name]: next,
      },
    });
  }
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("tags.memory")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={prune}
              onChange={(e) => onChange({ pruneOrphanTags: e.target.checked })}
            />
            {t("tags.prune")}
          </label>
          <p className="settings-hint">{t("tags.pruneHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={alpha}
              onChange={(e) => onChange({ tagsAlpha: e.target.checked })}
            />
            {t("tags.alpha")}
          </label>
          <p className="settings-hint">{t("tags.alphaHint")}</p>
        </div>
      </div>
      <div className="settings-card tag-list-card">
        <p className="settings-kicker">
          {tags.length ? tp("tags.count", tags.length) : t("item.tags")}
        </p>
        <Input
          className={FIELD_SM}
          value={createDraft}
          placeholder={t("tags.newPlaceholder")}
          maxLength={32}
          disabled={busy || tags.length >= 80}
          onChange={(e) => setCreateDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              createTag();
            }
          }}
        />
        {tags.length === 0 ? (
          <p className="settings-hint">{t("tags.empty")}</p>
        ) : (
          <div className="am-work">
            <div className="am-list-head is-tags">
              <div className="am-row-cells">
                <SortLabel id="name" sort={col.sort} onToggle={col.toggle} count={tags.length}>
                  {t("item.name")}
                </SortLabel>
                <SortLabel
                  id="count"
                  sort={col.sort}
                  onToggle={col.toggle}
                  className="am-row-end"
                  count={tags.length}
                >
                  {t("tags.countCol")}
                </SortLabel>
                <span className="am-row-action" />
              </div>
            </div>
            <EdgeFade className="am-list-wrap">
              <div className="am-list is-tags" role="list">
                {sortedTags.map((row) => {
                  const draft = drafts[row.name] ?? row.name;
                  const hex = lookupTagColor(row.name, localColors) ?? defaultTagHex(row.name);
                  return (
                    <div key={row.name} className="am-row is-static" role="listitem">
                      <div className="am-row-head">
                        <div className="am-row-cells">
                          <span className="am-row-title tag-name-cell">
                            <TagColorPick
                              hex={hex}
                              name={row.name}
                              disabled={busy}
                              onChange={(next) => changeColor(row.name, next)}
                            />
                            <input
                              className="tag-item-name h-7 w-full min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[0.8125rem] font-medium outline-none hover:border-border hover:bg-elevated focus:border-border focus:bg-elevated"
                              value={draft}
                              aria-label={t("tags.nameOf", {
                                name: row.name,
                              })}
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [row.name]: e.target.value,
                                }))
                              }
                              onBlur={() => renameTag(row.name, draft)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </span>
                          <span className="am-row-end">{row.count}</span>
                          <span className="am-row-action">
                            <button
                              type="button"
                              className="card-tool is-danger"
                              disabled={busy}
                              aria-label={t("tags.deleteAria", {
                                name: row.name,
                              })}
                              title={t("tags.deleteAria", {
                                name: row.name,
                              })}
                              onClick={() => removeTag(row.name)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </EdgeFade>
          </div>
        )}
      </div>
    </form>
  );
}
