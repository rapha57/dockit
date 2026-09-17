import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { t, te } from "@/lib/i18n";

const LIMIT = 50;
const CHIP_MAX = 2;
const CHIP_SEARCH_FROM = 8;

type PopPos = { top: number; left: number; width: number };

function usePickerPop({
  open,
  onClose,
  minWidth = 18 * 16,
  layoutKey,
}: {
  open: boolean;
  onClose: () => void;
  minWidth?: number;
  layoutKey?: unknown;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopPos | null>(null);

  useEffect(() => {
    if (!open) setPos(null);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const box = rootRef.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(22 * 16, Math.max(minWidth, box.width));
      const popH = popRef.current?.offsetHeight || 260;
      let top = box.bottom + 6;
      let left = box.left;
      if (top + popH > window.innerHeight - 10) top = Math.max(8, box.top - popH - 6);
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      setPos({ top, left, width });
    }
    place();
    const wrap = rootRef.current?.closest(".am-list-wrap");
    wrap?.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      wrap?.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, minWidth, layoutKey]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  return { rootRef, popRef, pos };
}

type ChipItem = {
  id: string;
  label: ReactNode;
  search?: string;
  onRemove?: () => void;
};

type ChipListProps = {
  names?: (string | null | undefined)[];
  max?: number;
  empty?: ReactNode;
  title?: string;
};

export function ChipList({ names, max = CHIP_MAX, empty = "—", title }: ChipListProps) {
  const list = (names || []).filter((name): name is string => Boolean(name));
  return (
    <ChipOverflow
      items={list.map((name, i) => ({ id: `${i}:${name}`, label: name, search: name }))}
      max={max}
      empty={empty}
      title={title}
    />
  );
}

function ChipOverflow({
  items,
  max = CHIP_MAX,
  empty = "—",
  title,
  extra,
  selected,
  suppressed,
  onOpen,
}: {
  items: ChipItem[];
  max?: number;
  empty?: ReactNode;
  title?: string;
  extra?: ReactNode;
  selected?: boolean;
  suppressed?: boolean;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = useCallback(() => setOpen(false), []);
  const { rootRef, popRef, pos } = usePickerPop({
    open,
    onClose: close,
    minWidth: 16 * 16,
    layoutKey: `${q}:${items.length}`,
  });
  const shown = items.slice(0, max);
  const more = items.length - shown.length;
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? items.filter((item) =>
        String(item.search || item.label || "")
          .toLowerCase()
          .includes(needle),
      )
    : items;
  const showSearch = items.length >= CHIP_SEARCH_FROM;
  const heading = title || t("access.chipAll");

  useEffect(() => {
    if (suppressed || items.length <= max) setOpen(false);
  }, [suppressed, items.length, max]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const pop =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className="am-picker-pop"
            role="dialog"
            aria-label={heading}
            style={
              pos
                ? { top: pos.top, left: pos.left, width: pos.width }
                : { visibility: "hidden", top: 0, left: 0 }
            }
          >
            <div className="am-picker-pop-head">
              <p>{heading}</p>
              <button
                type="button"
                className="am-icon-btn"
                onClick={() => setOpen(false)}
                aria-label={t("actions.close")}
                title={t("actions.close")}
              >
                <X className="size-3.5" />
              </button>
            </div>
            {showSearch ? (
              <label className="am-search">
                <Search className="size-3.5" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("access.pickerSearch")}
                  aria-label={t("access.pickerSearch")}
                  autoFocus
                />
              </label>
            ) : null}
            {!filtered.length ? (
              <p className="am-note">{needle ? t("empty.noResults") : t("access.pickerNone")}</p>
            ) : (
              <ul className="am-picker-results is-list">
                {filtered.map((item) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    {item.onRemove ? (
                      <button
                        type="button"
                        className="am-icon-btn"
                        aria-label={t("actions.delete")}
                        title={t("actions.delete")}
                        onClick={() => item.onRemove?.()}
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )
      : null;

  const chipClass = selected ? "am-chip is-on" : "am-chip";
  return (
    <div className="am-chip-overflow" ref={rootRef}>
      <div className="am-chips is-wrap">
        {items.length ? (
          shown.map((item) => (
            <span key={item.id} className={chipClass}>
              {item.label}
              {item.onRemove ? (
                <button
                  type="button"
                  className="am-chip-x"
                  aria-label={t("actions.delete")}
                  title={t("actions.delete")}
                  onClick={() => item.onRemove?.()}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          ))
        ) : (
          <span className="am-dim">{empty}</span>
        )}
        {more > 0 ? (
          <button
            type="button"
            className={`am-chip is-more${open ? " is-on" : ""}`}
            aria-expanded={open}
            aria-label={t("access.chipShowAll", { n: items.length })}
            title={t("access.chipShowAll", { n: items.length })}
            onClick={() => {
              onOpen?.();
              setOpen((v) => !v);
            }}
          >
            +{more}
          </button>
        ) : null}
        {extra}
      </div>
      {pop}
    </div>
  );
}

function kindLabel(kind: string, mode: string): string {
  if (mode === "add") {
    if (kind === "group") return t("access.addGroup");
    if (kind === "role") return t("access.addRole");
    return t("access.addUser");
  }
  if (kind === "group") return t("access.pickerTitleGroup");
  if (kind === "role") return t("access.pickerTitleRole");
  return t("access.pickerTitleUser");
}

export type PickerRow = { id: string; [key: string]: any };
export type PickerProvider = { id: string; label: ReactNode; kind: string };

type EntityPickerProps<T extends PickerRow> = {
  kind: "role" | "group" | "user";
  items?: T[];
  selectedIds?: string[];
  onChange: (ids: string[]) => void;
  providers?: PickerProvider[];
  labelOf: (row: T) => ReactNode;
  readOnly?: boolean;
  excludeIds?: string[];
  searchRemote?: (providerId: string, query: string) => Promise<T[]> | T[];
  onRemoteAdd?: (providerId: string, rows: T[]) => void | Promise<void>;
  trigger?: "button" | string;
  addLabel?: ReactNode;
};

export function EntityPicker<T extends PickerRow = PickerRow>({
  kind,
  items,
  selectedIds,
  onChange,
  providers,
  labelOf,
  readOnly,
  excludeIds,
  searchRemote,
  onRemoteAdd,
  trigger,
  addLabel,
}: EntityPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [provider, setProvider] = useState(() => {
    const list = providers || [];
    return list.find((p) => p.kind === "ad")?.id || list[0]?.id || "local";
  });
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [remoteRows, setRemoteRows] = useState<T[]>([]);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteErr, setRemoteErr] = useState("");
  const selected = selectedIds || [];
  const dirs = providers || [{ id: "local", label: t("access.idpTypeLocal"), kind: "local" }];
  const current = dirs.find((p) => p.id === provider) || dirs[0];
  const remote = current?.kind === "ad";
  const canSearch = Boolean(remote && searchRemote);
  const skip = [...(excludeIds || []), ...selected].join("\0");

  useEffect(() => {
    const timer = setTimeout(() => setDq(q), 150);
    return () => clearTimeout(timer);
  }, [q]);

  const { rootRef, popRef, pos } = usePickerPop({
    open,
    onClose: close,
    layoutKey: `${q}:${picked.join(",")}:${provider}:${remoteRows.length}:${remoteBusy}`,
  });

  useEffect(() => {
    if (!open) {
      setQ("");
      setDq("");
      setPicked([]);
      setRemoteRows([]);
      setRemoteErr("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !canSearch) {
      setRemoteRows([]);
      setRemoteBusy(false);
      return;
    }
    const needle = dq.trim();
    if (needle.length < 2) {
      setRemoteRows([]);
      setRemoteBusy(false);
      setRemoteErr("");
      return;
    }
    let alive = true;
    setRemoteBusy(true);
    Promise.resolve(searchRemote?.(current.id, needle))
      .then((rows) => {
        if (!alive) return;
        setRemoteRows(Array.isArray(rows) ? rows : []);
        setRemoteErr("");
      })
      .catch((err) => {
        if (!alive) return;
        setRemoteRows([]);
        setRemoteErr(te(err));
      })
      .finally(() => {
        if (alive) setRemoteBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [open, canSearch, dq, current?.id, searchRemote]);

  const results = useMemo(() => {
    const blocked = new Set(skip ? skip.split("\0") : []);
    if (canSearch) return remoteRows.filter((row) => row?.id && !blocked.has(row.id)).slice(0, LIMIT);
    if (remote) return [];
    const needle = dq.trim().toLowerCase();
    return (items || [])
      .filter((row) => !blocked.has(row.id))
      .filter((row) => {
        if (!needle) return true;
        return String(labelOf(row) || "")
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, LIMIT);
  }, [items, dq, remote, canSearch, remoteRows, skip, labelOf]);

  const selectedRows = (items || []).filter((row) => selected.includes(row.id));

  function togglePick(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function addPicked() {
    if (!picked.length) return;
    if (canSearch && onRemoteAdd) {
      const rows = results.filter((row) => picked.includes(row.id));
      void Promise.resolve(onRemoteAdd(current.id, rows));
      setOpen(false);
      return;
    }
    onChange([...selected, ...picked.filter((id) => !selected.includes(id))]);
    setOpen(false);
  }

  function remove(id: string) {
    onChange(selected.filter((x) => x !== id));
  }

  const pop =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className="am-picker-pop"
            role="dialog"
            aria-label={kindLabel(kind, "title")}
            style={
              pos
                ? { top: pos.top, left: pos.left, width: pos.width }
                : { visibility: "hidden", top: 0, left: 0 }
            }
          >
            <div className="am-picker-pop-head">
              <p>{kindLabel(kind, "title")}</p>
              <button
                type="button"
                className="am-icon-btn"
                onClick={() => setOpen(false)}
                aria-label={t("actions.close")}
                title={t("actions.close")}
              >
                <X className="size-3.5" />
              </button>
            </div>
            {dirs.length > 1 ? (
              <label className="am-field">
                <span>{t("access.pickerProvider")}</span>
                <Select
                  className="h-9 rounded-md bg-transparent"
                  value={current?.id || "local"}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  {dirs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <label className="am-search">
              <Search className="size-3.5" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("access.pickerSearch")}
                aria-label={t("access.pickerSearch")}
                autoFocus
              />
            </label>
            {canSearch && dq.trim().length < 2 ? (
              <p className="am-note">{t("access.pickerDirType")}</p>
            ) : remote && !canSearch ? (
              <p className="am-note">{t("access.pickerDirOff")}</p>
            ) : remoteBusy ? (
              <p className="am-note">{t("access.pickerDirBusy")}</p>
            ) : remoteErr ? (
              <p className="am-note is-warn">{remoteErr}</p>
            ) : !results.length ? (
              <p className="am-note">{dq.trim() ? t("empty.noResults") : t("access.pickerType")}</p>
            ) : (
              <ul className="am-picker-results">
                {results.map((row) => (
                  <li key={row.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={picked.includes(row.id)}
                        onChange={() => togglePick(row.id)}
                      />
                      {labelOf ? labelOf(row) : row.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="am-picker-actions">
              <button type="button" className="am-text-btn" onClick={() => setOpen(false)}>
                {t("actions.cancel")}
              </button>
              <Button
                type="button"
                disabled={(remote && !canSearch) || remoteBusy || !picked.length}
                onClick={addPicked}
              >
                {t("access.pickerAdd")}
              </Button>
            </div>
          </div>,
          document.body,
        )
      : null;

  const addBtn = readOnly ? null : trigger === "button" ? (
    <button type="button" className="am-create shrink-0" onClick={() => setOpen((v) => !v)}>
      <Plus className="size-3.5" /> {addLabel || kindLabel(kind, "add")}
    </button>
  ) : (
    <button
      type="button"
      className={`am-chip-add${open ? " is-on" : ""}`}
      onClick={() => setOpen((v) => !v)}
    >
      <Plus className="size-3" /> {addLabel || kindLabel(kind, "add")}
    </button>
  );

  function listTitle() {
    if (kind === "group") return t("access.groups");
    if (kind === "role") return t("access.roles");
    return t("access.users");
  }

  return (
    <div className={`am-picker${open ? " is-open" : ""}`} ref={rootRef}>
      {trigger === "button" ? (
        addBtn
      ) : (
        <ChipOverflow
          items={selectedRows.map((row) => ({
            id: row.id,
            label: labelOf(row),
            search: String(labelOf(row) || ""),
            onRemove: readOnly ? undefined : () => remove(row.id),
          }))}
          empty={t("access.pickerNone")}
          title={listTitle()}
          extra={addBtn}
          selected
          suppressed={open}
          onOpen={() => setOpen(false)}
        />
      )}
      {pop}
    </div>
  );
}
