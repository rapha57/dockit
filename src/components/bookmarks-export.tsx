import { useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EdgeFade } from "@/components/edge-fade";
import { FormActions } from "@/components/form-actions";
import { t } from "@/lib/i18n";
import {
  allLinkIds,
  bookmarkTree,
  bookmarksHtml,
  checkState,
  linkIdsOf,
  toggleIds,
  type BookmarkCategory,
  type BookmarkSpace,
  type CheckState,
} from "@/lib/bookmarks-html";
import type { CatalogSpace } from "@/lib/portal-ui";

function TreeCheck({
  state,
  onToggle,
  children,
}: {
  state: CheckState;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <label className="min-w-0">
      <input
        type="checkbox"
        checked={state === "on"}
        ref={(el) => {
          if (el) el.indeterminate = state === "mixed";
        }}
        onChange={onToggle}
      />
      {children}
    </label>
  );
}

function CategoryBranch({
  cat,
  selected,
  onToggle,
}: {
  cat: BookmarkCategory;
  selected: ReadonlySet<string>;
  onToggle: (ids: readonly string[]) => void;
}) {
  const ids = linkIdsOf(cat);
  return (
    <div className="settings-field is-child">
      <TreeCheck state={checkState(ids, selected)} onToggle={() => onToggle(ids)}>
        {cat.name}
      </TreeCheck>
      <div className="settings-field is-child">
        {cat.cards.flatMap((card) =>
          card.links.map((link) => (
            <TreeCheck
              key={link.id}
              state={checkState([link.id], selected)}
              onToggle={() => onToggle([link.id])}
            >
              <span className="min-w-0 truncate">
                {link.title}
                <span className="am-dim"> ({link.url})</span>
              </span>
            </TreeCheck>
          )),
        )}
      </div>
    </div>
  );
}

function SpaceBranch({
  space,
  selected,
  onToggle,
}: {
  space: BookmarkSpace;
  selected: ReadonlySet<string>;
  onToggle: (ids: readonly string[]) => void;
}) {
  const ids = linkIdsOf(space);
  return (
    <>
      <TreeCheck state={checkState(ids, selected)} onToggle={() => onToggle(ids)}>
        {space.name}
      </TreeCheck>
      {space.categories.map((cat) => (
        <CategoryBranch key={cat.id} cat={cat} selected={selected} onToggle={onToggle} />
      ))}
    </>
  );
}

export function BookmarksExport({
  catalog,
  title,
  onClose,
}: {
  catalog: CatalogSpace[];
  title?: string;
  onClose: () => void;
}) {
  const tree = useMemo(() => bookmarkTree(catalog), [catalog]);
  const ids = useMemo(() => allLinkIds(tree), [tree]);
  const [selected, setSelected] = useState(() => new Set(ids));
  const count = selected.size;
  function onToggle(nextIds: readonly string[]) {
    setSelected((prev) => toggleIds(prev, nextIds));
  }
  function download() {
    if (!count) {
      toast.error(t("account.exportBookmarksEmpty"));
      return;
    }
    const blob = new Blob([bookmarksHtml(tree, selected, title || "Dockit")], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dockit-bookmarks.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(t("account.exportBookmarksDone"));
    onClose();
  }
  return (
    <form
      className="settings-body"
      onSubmit={(e) => {
        e.preventDefault();
        download();
      }}
    >
      <div className="settings-head">
        <div className="settings-head-copy">
          <h3 id="dockit-bookmarks-title" className="dialog-title">
            {t("account.exportBookmarks")}
          </h3>
          <p className="settings-lead">{t("account.exportBookmarksLead")}</p>
        </div>
        <div className="settings-head-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mb-2 flex shrink-0 gap-3">
        <button
          type="button"
          className="am-text-btn"
          disabled={checkState(ids, selected) === "on"}
          onClick={() => setSelected(new Set(ids))}
        >
          {t("account.exportBookmarksAll")}
        </button>
        <button
          type="button"
          className="am-text-btn"
          disabled={count === 0}
          onClick={() => setSelected(new Set())}
        >
          {t("account.exportBookmarksClear")}
        </button>
      </div>
      <EdgeFade className="am-list-wrap">
        {tree.length ? (
          <div className="settings-toggles">
            {tree.map((space) => (
              <SpaceBranch key={space.id} space={space} selected={selected} onToggle={onToggle} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("empty.noLinks")}</p>
        )}
      </EdgeFade>
      <FormActions
        busy={false}
        onCancel={onClose}
        label={t("actions.exportHtml")}
        disabled={!count}
      />
    </form>
  );
}
