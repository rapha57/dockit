import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

const LIMIT = 50;

export function ChipList({ names, max = 2, empty = "—" }) {
	const list = (names || []).filter(Boolean);
	if (!list.length) return <span className="am-dim">{empty}</span>;
	const shown = list.slice(0, max);
	const extra = list.length - shown.length;
	return (
		<span className="am-chips">
			{shown.map((name) => (
				<span key={name} className="am-chip">{name}</span>
			))}
			{extra > 0 ? <span className="am-chip is-more">+{extra}</span> : null}
		</span>
	);
}

function kindLabel(kind, mode) {
	if (mode === "add") {
		if (kind === "group") return t("access.addGroup");
		if (kind === "role") return t("access.addRole");
		return t("access.addUser");
	}
	if (kind === "group") return t("access.pickerTitleGroup");
	if (kind === "role") return t("access.pickerTitleRole");
	return t("access.pickerTitleUser");
}

export function EntityPicker({
	kind,
	items,
	selectedIds,
	onChange,
	providers,
	labelOf,
	readOnly,
	excludeIds
}) {
	const rootRef = useRef(null);
	const popRef = useRef(null);
	const [open, setOpen] = useState(false);
	const [provider, setProvider] = useState("local");
	const [q, setQ] = useState("");
	const [dq, setDq] = useState("");
	const [picked, setPicked] = useState([]);
	const [pos, setPos] = useState(null);
	const selected = selectedIds || [];
	const dirs = providers || [{ id: "local", label: t("access.sourceLocal"), kind: "local" }];
	const current = dirs.find((p) => p.id === provider) || dirs[0];
	const remote = current?.kind === "ad";
	const skip = [...(excludeIds || []), ...selected].join("\0");

	useEffect(() => {
		const timer = setTimeout(() => setDq(q), 150);
		return () => clearTimeout(timer);
	}, [q]);

	useEffect(() => {
		if (!open) {
			setQ("");
			setDq("");
			setPicked([]);
			setPos(null);
		}
	}, [open]);

	useLayoutEffect(() => {
		if (!open) return;
		function place() {
			const box = rootRef.current?.getBoundingClientRect();
			if (!box) return;
			const width = Math.min(22 * 16, Math.max(18 * 16, box.width));
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
	}, [open, q, picked, provider]);

	useEffect(() => {
		if (!open) return;
		function onDoc(e) {
			if (rootRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
			setOpen(false);
		}
		function onKey(e) {
			if (e.key === "Escape") {
				e.stopPropagation();
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", onDoc);
		window.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("mousedown", onDoc);
			window.removeEventListener("keydown", onKey, true);
		};
	}, [open]);

	const results = useMemo(() => {
		if (remote) return [];
		const blocked = new Set(skip ? skip.split("\0") : []);
		const needle = dq.trim().toLowerCase();
		return (items || [])
			.filter((row) => !blocked.has(row.id))
			.filter((row) => {
				if (!needle) return true;
				return String(labelOf(row) || "").toLowerCase().includes(needle);
			})
			.slice(0, LIMIT);
	}, [items, dq, remote, skip, labelOf]);

	const selectedRows = (items || []).filter((row) => selected.includes(row.id));

	function togglePick(id) {
		setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
	}

	function addPicked() {
		if (!picked.length) return;
		onChange([...selected, ...picked.filter((id) => !selected.includes(id))]);
		setOpen(false);
	}

	function remove(id) {
		onChange(selected.filter((x) => x !== id));
	}

	const pop = open && typeof document !== "undefined" ? createPortal(
		<div
			ref={popRef}
			className="am-picker-pop"
			role="dialog"
			aria-label={kindLabel(kind, "title")}
			style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden", top: 0, left: 0 }}
		>
			<div className="am-picker-pop-head">
				<p>{kindLabel(kind, "title")}</p>
				<button type="button" className="am-icon-btn" onClick={() => setOpen(false)} aria-label={t("actions.close")}>
					<X className="size-3.5" />
				</button>
			</div>
			{dirs.length > 1 ? (
				<label className="am-field">
					<span>{t("access.pickerProvider")}</span>
					<select className="field-input h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-fg outline-none" value={current?.id || "local"} onChange={(e) => setProvider(e.target.value)}>
						{dirs.map((p) => (
							<option key={p.id} value={p.id}>{p.label}</option>
						))}
					</select>
				</label>
			) : null}
			<label className="am-search">
				<Search className="size-3.5" aria-hidden />
				<input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("access.pickerSearch")} aria-label={t("access.pickerSearch")} autoFocus />
			</label>
			{remote ? (
				<p className="am-note">{t("access.pickerDirOff")}</p>
			) : !results.length ? (
				<p className="am-note">{dq.trim() ? t("empty.noResults") : t("access.pickerType")}</p>
			) : (
				<ul className="am-picker-results">
					{results.map((row) => (
						<li key={row.id}>
							<label>
								<input type="checkbox" checked={picked.includes(row.id)} onChange={() => togglePick(row.id)} />
								{labelOf(row)}
							</label>
						</li>
					))}
				</ul>
			)}
			<div className="am-picker-actions">
				<button type="button" className="am-text-btn" onClick={() => setOpen(false)}>{t("actions.cancel")}</button>
				<Button type="button" size="sm" disabled={remote || !picked.length} onClick={addPicked}>{t("access.pickerAdd")}</Button>
			</div>
		</div>,
		document.body
	) : null;

	return (
		<div className={`am-picker${open ? " is-open" : ""}`} ref={rootRef}>
			<div className="am-chips is-wrap">
				{selectedRows.length ? selectedRows.map((row) => (
					<span key={row.id} className="am-chip is-on">
						{labelOf(row)}
						{readOnly ? null : (
							<button type="button" className="am-chip-x" aria-label={t("actions.delete")} onClick={() => remove(row.id)}>
								<X className="size-3" />
							</button>
						)}
					</span>
				)) : <span className="am-dim">{t("access.pickerNone")}</span>}
				{readOnly ? null : (
					<button type="button" className={`am-chip-add${open ? " is-on" : ""}`} onClick={() => setOpen((v) => !v)}>
						<Plus className="size-3" /> {kindLabel(kind, "add")}
					</button>
				)}
			</div>
			{pop}
		</div>
	);
}
