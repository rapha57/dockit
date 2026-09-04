import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { t } from "@/lib/i18n";

export const NEW_ROW = "new";

export function useExpandSession() {
	const dirtyRef = useRef(false);
	const [openId, setOpenId] = useState(null);
	const [editing, setEditing] = useState(false);
	const [ask, setAsk] = useState(null);

	function exec(fn) {
		dirtyRef.current = false;
		setAsk(null);
		fn();
	}

	function requestClose(apply) {
		const run = () => exec(() => {
			setOpenId(null);
			setEditing(false);
			apply?.();
		});
		if (dirtyRef.current) {
			setAsk({ run });
			return false;
		}
		run();
		return true;
	}

	function requestOpen(id, { edit = false, apply } = {}) {
		if (id == null) return requestClose(apply);
		if (openId === id && !edit) return requestClose(apply);
		const run = () => exec(() => {
			setOpenId(id);
			setEditing(Boolean(edit));
			apply?.();
		});
		if (dirtyRef.current) {
			setAsk({ run });
			return false;
		}
		run();
		return true;
	}

	function stay(id) {
		dirtyRef.current = false;
		setAsk(null);
		setEditing(false);
		if (id) setOpenId(id);
	}

	return {
		openId,
		editing,
		ask,
		setEditing,
		dirty: () => dirtyRef.current,
		markDirty: (v = true) => {
			dirtyRef.current = Boolean(v);
		},
		requestOpen,
		requestClose,
		confirmAsk: () => ask?.run?.(),
		dismissAsk: () => setAsk(null),
		stay
	};
}

export function ExpandRow({
	id,
	expanded,
	onToggle,
	cells,
	children,
	grip,
	onGripDown,
	onGripMove,
	onGripUp,
	onAltMove,
	dragging,
	className
}) {
	const panelId = `am-exp-${String(id || "row").replace(/[^a-zA-Z0-9_-]/g, "")}`;
	function onHeadKey(e) {
		if (e.target !== e.currentTarget && e.target.closest("button, input, select, textarea, a, [contenteditable]")) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onToggle();
			return;
		}
		if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
			e.preventDefault();
			onAltMove?.(e.key === "ArrowUp" ? -1 : 1);
		}
	}
	function onHeadClick(e) {
		if (e.target.closest(".am-row-grip, .am-expand, button, a, input, select, textarea, label")) return;
		onToggle();
	}
	return (
		<div
			className={`am-row${expanded ? " is-open" : ""}${grip ? " has-grip" : ""}${dragging ? " is-dragging" : ""}${className ? ` ${className}` : ""}`}
			role="listitem"
			data-row-id={id}
		>
			<div
				className="am-row-head"
				tabIndex={0}
				onClick={onHeadClick}
				onKeyDown={onHeadKey}
			>
				{grip ? (
					<button
						type="button"
						className="am-row-grip"
						aria-label={t("access.idpDrag")}
						onPointerDown={onGripDown}
						onPointerMove={onGripMove}
						onPointerUp={onGripUp}
						onPointerCancel={onGripUp}
						onClick={(e) => e.stopPropagation()}
					>
						<GripVertical className="size-4" />
					</button>
				) : null}
				<button
					type="button"
					className="am-chevron"
					aria-expanded={expanded}
					aria-controls={panelId}
					onClick={(e) => {
						e.stopPropagation();
						onToggle();
					}}
				>
					{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
				</button>
				<div className="am-row-cells">{cells}</div>
			</div>
			{expanded ? (
				<div id={panelId} className="am-expand" role="region">
					{children}
				</div>
			) : null}
		</div>
	);
}
