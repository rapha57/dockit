import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownAZ,
  ArrowRightLeft,
  ArrowUpZA,
  ChevronDown,
  Copy,
  GripVertical,
  LayoutGrid,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { AppCard, type AppCardProps } from "@/components/app-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PortalIcon } from "@/lib/icons";
import { allowsFavorite, ITEM_GRID, itemSpanClass } from "@/lib/portal-dnd";
import { cardsAlphaDir, type PortalCard, type PortalCategory, type PortalSettings } from "@/lib/portal";
import type { ProbeResult } from "@/lib/probe";
import type { CatalogSpace } from "@/lib/portal-ui";
import { t, tp } from "@/lib/i18n";
import { tagTone } from "@/lib/tag-colors";

export type CatalogVariant = "space" | "search" | "favs";

export type FavGroup = {
	space: { id: string; name: string; icon: string };
	cat: PortalCategory;
	cards: PortalCard[];
};

export type CategoryChrome = {
	settings: PortalSettings;
	probes: Record<string, ProbeResult>;
	tagFilter: string[];
	favSet: Set<string>;
};

export type CategoryHandlers = {
	goSpace: (id: string) => void;
	toggleCollapsed: (id: string) => void;
	openCard: (cat: PortalCategory, app?: PortalCard) => void;
	moveCat: (cat: PortalCategory, fromSpaceId: string) => void;
	sortCat: (cat: PortalCategory) => void;
	resetCat: (cat: PortalCategory) => void;
	duplicateCat: (cat: PortalCategory, spaceId: string) => void;
	editCat: (cat: PortalCategory) => void;
	deleteCat: (cat: PortalCategory) => void;
	duplicateCard: (app: PortalCard, catId: string) => void;
	deleteCard: (app: PortalCard) => void;
	toggleTag: (name: string) => void;
	toggleFav: (id: string) => void;
	recheck: (app: PortalCard) => void;
	openLink: (app: PortalCard) => void;
	onCatPointerDown?: (e: ReactPointerEvent<HTMLDivElement>, cat: PortalCategory, index: number) => void;
	onCardPointerDown?: (e: ReactPointerEvent<HTMLDivElement>, app: PortalCard, cat: PortalCategory) => void;
	didDrag?: () => boolean;
};

export function catalogCardChrome(
	app: PortalCard,
	settings: PortalSettings,
	probes: Record<string, ProbeResult>,
): Pick<
	AppCardProps,
	| "tagColors"
	| "tagsAlpha"
	| "cardIconBg"
	| "health"
	| "healthPending"
	| "showHealth"
	| "showClicks"
	| "dimMenu"
	| "ctxMenu"
	| "ctxHideUrl"
	| "className"
> {
	return {
		className: itemSpanClass(app),
		tagColors: settings.tagColors,
		tagsAlpha: settings.tagsAlpha !== false,
		cardIconBg: settings.cardIconBg !== false,
		health: settings.healthChecks ? probes[app.id] : void 0,
		healthPending: Boolean(settings.healthChecks && app.check !== "off" && !probes[app.id]),
		showHealth: settings.healthChecks,
		showClicks: settings.usageStats,
		dimMenu: Boolean(settings.annexFade),
		ctxMenu: settings.cardContextMenu !== false,
		ctxHideUrl: Boolean(settings.ctxHideUrl),
	};
}

export function CatalogApp({
	app,
	settings,
	probes,
	...rest
}: {
	app: PortalCard;
	settings: PortalSettings;
	probes: Record<string, ProbeResult>;
} & Omit<AppCardProps, "app">) {
	return <AppCard app={app} {...catalogCardChrome(app, settings, probes)} {...rest} />;
}

export function CategoryTools({
	cat,
	locale,
	onAddCard,
	onMove,
	onSort,
	onReset,
	onDuplicate,
	onEdit,
	onDelete,
}: {
	cat: PortalCategory;
	locale: unknown;
	onAddCard: () => void;
	onMove: () => void;
	onSort: () => void;
	onReset: () => void;
	onDuplicate: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const za = cardsAlphaDir(cat.cards, locale) === "az";
	return (
		<div className="flex items-center gap-[0.35rem]">
			<button type="button" className="card-tool" aria-label={t("actions.addCard")} title={t("actions.addCard")} onClick={onAddCard}>
				<Plus className="size-3.5" />
			</button>
			<button type="button" className="card-tool" aria-label={t("access.moveSection")} title={t("access.moveSection")} onClick={onMove}>
				<ArrowRightLeft className="size-3.5" />
			</button>
			{cat.cards.length ? (
				<>
					<button
						type="button"
						className="card-tool"
						aria-label={za ? t("cat.sortZa") : t("cat.sortAlpha")}
						title={za ? t("cat.sortZa") : t("cat.sortAlpha")}
						onClick={onSort}
						onPointerDown={(e) => e.stopPropagation()}
					>
						{za ? <ArrowUpZA className="size-3.5" /> : <ArrowDownAZ className="size-3.5" />}
					</button>
					<button
						type="button"
						className="card-tool"
						aria-label={t("cat.resetLayout")}
						title={t("cat.resetLayout")}
						onClick={onReset}
						onPointerDown={(e) => e.stopPropagation()}
					>
						<LayoutGrid className="size-3.5" />
					</button>
				</>
			) : null}
			<button type="button" className="card-tool" aria-label={t("actions.duplicate")} title={t("actions.duplicate")} onClick={onDuplicate}>
				<Copy className="size-3.5" />
			</button>
			<button type="button" className="card-tool" aria-label={t("aria.editCategory")} title={t("aria.editCategory")} onClick={onEdit}>
				<Pencil className="size-3.5" />
			</button>
			<button type="button" className="card-tool is-danger" aria-label={t("aria.deleteCategory")} title={t("aria.deleteCategory")} onClick={onDelete}>
				<Trash2 className="size-3.5" />
			</button>
		</div>
	);
}

function CatCount({ name, n, on }: { name: string; n: number; on: boolean }) {
	if (!on) return null;
	return (
		<span className="count-chip" data-tone={tagTone(name)}>
			{n}
		</span>
	);
}

function CategoryCards({
	cat,
	cards,
	variant,
	editMode,
	canEdit,
	canDrag,
	canResize,
	draggingCardId,
	chrome,
	handlers,
}: {
	cat: PortalCategory;
	cards: PortalCard[];
	variant: CatalogVariant;
	editMode: boolean;
	canEdit: boolean;
	canDrag: boolean;
	canResize: boolean;
	draggingCardId?: string;
	chrome: CategoryChrome;
	handlers: CategoryHandlers;
}) {
	const { settings, probes, tagFilter, favSet } = chrome;
	const spaceDrag = variant === "space" && canDrag;
	return (
		<div data-app-grid={variant === "space" ? "" : undefined} className={ITEM_GRID}>
			{cards.map((app) => (
				<CatalogApp
					key={app.id}
					app={app}
					settings={settings}
					probes={probes}
					editMode={editMode && canEdit}
					canDrag={spaceDrag}
					canResize={spaceDrag && canResize && app.kind !== "app"}
					dragging={draggingCardId === app.id}
					onTag={handlers.toggleTag}
					activeTags={tagFilter}
					favorite={favSet.has(app.id)}
					onFavorite={editMode || !allowsFavorite(app, settings) ? undefined : () => handlers.toggleFav(app.id)}
					onRecheck={() => handlers.recheck(app)}
					onOpen={() => handlers.openLink(app)}
					onPointerDown={spaceDrag ? (e) => handlers.onCardPointerDown?.(e, app, cat) : undefined}
					onEdit={variant === "favs" ? () => undefined : () => handlers.openCard(cat, app)}
					onDuplicate={variant === "favs" ? undefined : () => handlers.duplicateCard(app, cat.id)}
					onDelete={variant === "favs" ? () => undefined : () => handlers.deleteCard(app)}
				/>
			))}
		</div>
	);
}

export function CategorySection({
	variant,
	cat,
	cards,
	space,
	spaceId,
	catIndex = 0,
	editMode,
	canEdit,
	canDrag,
	canResize,
	collapsed,
	draggingCat,
	dropTarget,
	draggingCardId,
	chrome,
	handlers,
}: {
	variant: CatalogVariant;
	cat: PortalCategory;
	cards?: PortalCard[];
	space?: { id: string; name: string; icon: string };
	spaceId: string;
	catIndex?: number;
	editMode: boolean;
	canEdit: boolean;
	canDrag: boolean;
	canResize: boolean;
	collapsed?: boolean;
	draggingCat?: boolean;
	dropTarget?: boolean;
	draggingCardId?: string;
	chrome: CategoryChrome;
	handlers: CategoryHandlers;
}) {
	const list = cards ?? cat.cards;
	const showTools = variant !== "favs" && editMode && canEdit;
	const spaceMode = variant === "space";

	if (spaceMode && draggingCat) {
		return (
			<div key={cat.id} data-cat-id={cat.id} className="drop-slot drop-slot-cat">
				<span className="drop-slot-label">{t("nav.dropHere")}</span>
			</div>
		);
	}

	const title = (
		<>
			<span className="portal-mark flex size-9 items-center justify-center rounded-lg text-fg">
				<PortalIcon name={cat.icon} className="size-4" />
			</span>
			<h2 className="truncate text-xl font-semibold tracking-tight">{cat.name}</h2>
			<CatCount name={cat.name} n={list.length} on={chrome.settings.catCounts !== false} />
		</>
	);

	return (
		<section
			key={cat.id}
			data-cat-id={spaceMode ? cat.id : undefined}
			className={`cat-section${dropTarget ? " is-drop" : ""}`}
		>
			<div className={`cat-head ${collapsed ? "is-collapsed" : ""}`}>
				{variant === "favs" && space ? (
					<div className="cat-head-main">
						<button
							type="button"
							onClick={() => handlers.goSpace(space.id)}
							className="flex min-w-0 items-center gap-3 text-muted hover:text-fg"
						>
							<span className="portal-mark flex size-9 items-center justify-center rounded-lg text-fg">
								<PortalIcon name={space.icon} className="size-4" />
							</span>
							<span className="truncate text-xl font-semibold tracking-tight">{space.name}</span>
						</button>
						<span className="text-subtle">/</span>
						{title}
					</div>
				) : spaceMode ? (
					<div
						data-cat-handle=""
						className={`cat-head-main select-none ${canDrag ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"}`}
						onClick={() => {
							if (handlers.didDrag?.()) return;
							handlers.toggleCollapsed(cat.id);
						}}
						onPointerDown={(e) => handlers.onCatPointerDown?.(e, cat, catIndex)}
					>
						{canDrag ? <GripVertical className="size-4 shrink-0 text-subtle" aria-hidden /> : null}
						{title}
					</div>
				) : (
					<div className="cat-head-main">{title}</div>
				)}
				<div className="flex items-center gap-[0.35rem]">
					{spaceMode ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={collapsed ? t("cat.expand") : t("cat.collapse")}
							title={collapsed ? t("cat.expand") : t("cat.collapse")}
							aria-expanded={!collapsed}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handlers.toggleCollapsed(cat.id);
							}}
							onPointerDown={(e) => e.stopPropagation()}
						>
							<ChevronDown className={`size-4 text-muted transition-transform ${collapsed ? "-rotate-90" : ""}`} />
						</Button>
					) : null}
					{showTools ? (
						<CategoryTools
							cat={cat}
							locale={chrome.settings.locale}
							onAddCard={() => handlers.openCard(cat)}
							onMove={() => handlers.moveCat(cat, spaceId)}
							onSort={() => handlers.sortCat(cat)}
							onReset={() => handlers.resetCat(cat)}
							onDuplicate={() => handlers.duplicateCat(cat, spaceId)}
							onEdit={() => handlers.editCat(cat)}
							onDelete={() => handlers.deleteCat(cat)}
						/>
					) : null}
				</div>
			</div>
			{spaceMode && draggingCat ? null : (
				<div className="cat-body">
					{spaceMode && list.length === 0 ? (
						<p className="empty-well flex items-center justify-center gap-1 px-4 py-8 text-center text-sm text-muted">
							{canDrag ? [t("empty.noCardsDrop"), " ", <Plus className="size-3.5" />] : t("empty.noCardsAdd")}
						</p>
					) : (
						<CategoryCards
							cat={cat}
							cards={list}
							variant={variant}
							editMode={editMode}
							canEdit={canEdit}
							canDrag={canDrag}
							canResize={canResize}
							draggingCardId={draggingCardId}
							chrome={chrome}
							handlers={handlers}
						/>
					)}
				</div>
			)}
		</section>
	);
}

export function CatalogView({
	mode,
	favGroups,
	searchHits,
	categories,
	activeSpaceId,
	query,
	tagFilter,
	downFilter,
	editMode,
	canEditActive,
	canEditSpace,
	canDrag,
	canResize,
	collapsed,
	dragKind,
	dropCatId,
	draggingCardId,
	liveCatId,
	chrome,
	handlers,
	onAddCategory,
}: {
	mode: CatalogVariant;
	favGroups: FavGroup[];
	searchHits: CatalogSpace[];
	categories: PortalCategory[];
	activeSpaceId: string;
	query: string;
	tagFilter: string[];
	downFilter: boolean;
	editMode: boolean;
	canEditActive: boolean;
	canEditSpace: (id: string) => boolean;
	canDrag: boolean;
	canResize: boolean;
	collapsed: (id: string) => boolean;
	dragKind?: string | null;
	dropCatId?: string;
	draggingCardId?: string;
	liveCatId?: string;
	chrome: CategoryChrome;
	handlers: CategoryHandlers;
	onAddCategory: () => void;
}) {
	if (mode === "favs") {
		if (favGroups.length === 0) {
			return (
				<div className="empty-page">
					<div className="empty-page-mark">
						<Star className="size-7" />
					</div>
					<p>{t("empty.favs")}</p>
				</div>
			);
		}
		return (
			<div className="space-y-12">
				{favGroups.map((group) => (
					<CategorySection
						key={`${group.space.id}:${group.cat.id}`}
						variant="favs"
						cat={group.cat}
						cards={group.cards}
						space={group.space}
						spaceId={group.space.id}
						editMode={false}
						canEdit={false}
						canDrag={false}
						canResize={false}
						chrome={chrome}
						handlers={handlers}
					/>
				))}
			</div>
		);
	}

	if (mode === "search") {
		if (searchHits.length === 0) {
			return (
				<p className="py-16 text-center text-sm text-muted">
					{t("empty.noResults")}
					{query.trim() ? t("empty.forQuery", { q: query.trim() }) : ""}
					{tagFilter.length
						? t(tagFilter.length > 1 ? "empty.withTags" : "empty.withTag", { tags: tagFilter.join(" + ") })
						: ""}
					{downFilter ? t("empty.amongDown") : ""}
				</p>
			);
		}
		const hits = searchHits.reduce((n, space) => n + space.categories.reduce((m, c) => m + c.cards.length, 0), 0);
		return (
			<div className="space-y-14">
				<p className="text-sm text-muted">
					{tp("empty.hits", hits)} {tp("empty.inSpaces", searchHits.length)}
				</p>
				{searchHits.map((space) => (
					<div key={space.id} className="space-y-10">
						<button
							type="button"
							onClick={() => handlers.goSpace(space.id)}
							className="flex items-center gap-2 text-sm font-medium text-muted hover:text-fg"
						>
							<PortalIcon name={space.icon} className="size-4" />
							{space.name}
							<span className="count-chip" data-tone={tagTone(space.name)}>
								{space.categories.reduce((n, c) => n + c.cards.length, 0)}
							</span>
						</button>
						{space.categories.map((cat) => (
							<CategorySection
								key={cat.id}
								variant="search"
								cat={cat}
								spaceId={space.id}
								editMode={editMode}
								canEdit={canEditSpace(space.id)}
								canDrag={false}
								canResize={false}
								chrome={chrome}
								handlers={handlers}
							/>
						))}
					</div>
				))}
			</div>
		);
	}

	const visible = editMode ? categories : categories.filter((c) => c.cards.length > 0);
	if (visible.length === 0) {
		return editMode ? <EmptyState editMode={canEditActive} onAdd={canEditActive ? onAddCategory : undefined} /> : null;
	}

	return (
		<div className={dragKind === "cat" ? "space-y-3" : "space-y-12"}>
			{categories.map((cat, catIndex) => {
				if (!editMode && cat.cards.length === 0) return null;
				return (
					<CategorySection
						key={cat.id}
						variant="space"
						cat={cat}
						spaceId={activeSpaceId}
						catIndex={catIndex}
						editMode={editMode}
						canEdit={canEditActive}
						canDrag={canDrag}
						canResize={canResize}
						collapsed={collapsed(cat.id)}
						draggingCat={dragKind === "cat" && liveCatId === cat.id}
						dropTarget={dragKind === "card" && dropCatId === cat.id}
						draggingCardId={draggingCardId}
						chrome={chrome}
						handlers={handlers}
					/>
				);
			})}
			{editMode && canEditActive ? <EmptyState editMode compact onAdd={onAddCategory} /> : null}
		</div>
	);
}
