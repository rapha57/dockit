import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { t } from "@/lib/i18n";

export const NEW_ROW = "new";

type Ask = { run: () => void };
type RequestOpenOptions = { edit?: boolean; apply?: () => void };

export function useExpandSession() {
	const dirtyRef = useRef(false);
	const [openId, setOpenId] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);
	const [ask, setAsk] = useState<Ask | null>(null);

	function exec(fn: () => void) {
		dirtyRef.current = false;
		setAsk(null);
		fn();
	}

	function requestClose(apply?: () => void) {
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

	function requestOpen(id: string | null | undefined, { edit = false, apply }: RequestOpenOptions = {}) {
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

	function stay(id?: string | null) {
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
		markDirty: (v: boolean = true) => {
			dirtyRef.current = Boolean(v);
		},
		requestOpen,
		requestClose,
		confirmAsk: () => ask?.run?.(),
		dismissAsk: () => setAsk(null),
		stay
	};
}

type ExpandRowProps = {
	id?: string | number | null;
	expanded?: boolean;
	onToggle: () => void;
	cells?: ReactNode;
	children?: ReactNode;
	grip?: boolean;
	onGripDown?: (e: PointerEvent<HTMLButtonElement>) => void;
	onGripMove?: (e: PointerEvent<HTMLButtonElement>) => void;
	onGripUp?: (e: PointerEvent<HTMLButtonElement>) => void;
	onAltMove?: (dir: 1 | -1) => void;
	dragging?: boolean;
	className?: string;
};

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
}: ExpandRowProps) {
	const panelId = `am-exp-${String(id || "row").replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const padGrip = Boolean(grip) || /\bis-provider\b/.test(className || "");
	function onHeadKey(e: KeyboardEvent<HTMLDivElement>) {
		const target = e.target as HTMLElement;
		if (target !== e.currentTarget && target.closest("button, input, select, textarea, a, [contenteditable]")) return;
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
	function onHeadClick(e: MouseEvent<HTMLDivElement>) {
		const target = e.target as HTMLElement;
		if (target.closest(".am-row-grip, .am-expand, button, a, input, select, textarea, label")) return;
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
						<GripVertical className="size-3.5" strokeWidth={1.75} />
					</button>
				) : padGrip ? (
					<span className="am-chevron-spacer" aria-hidden />
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
					{expanded ? <ChevronDown className="size-3.5" strokeWidth={1.75} /> : <ChevronRight className="size-3.5" strokeWidth={1.75} />}
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
