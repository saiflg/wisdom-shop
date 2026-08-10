"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuthStore } from "@/store/auth-store";
import { useNavStore } from "@/store/nav-store";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { findActiveLeaf, flattenLeaves, visibleGroups, type NavGroup, type NavLeaf } from "@/lib/navigation";
import { useBranding } from "@/lib/branding-context";
import { useSchoolModules } from "@/lib/use-school-modules";
import { NavIconGlyph, ChevronIcon, StarIcon } from "./nav-icon";
import { SchoolMark } from "./school-mark";

/** Nav keys are authored in navigation.ts and always exist in the dictionary. */
function asKey(key: string): TranslationKey {
  return key as TranslationKey;
}

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const { t } = useTranslation();
  // Kept nullable rather than `?? []` here: defaulting outside the memo
  // would build a fresh array every render and recompute the whole tree.
  const userRoles = useAuthStore((s) => s.user?.roles);
  const branding = useBranding();

  const collapsed = useNavStore((s) => s.collapsed);
  const expandedGroups = useNavStore((s) => s.expandedGroups);
  const favorites = useNavStore((s) => s.favorites);
  const recents = useNavStore((s) => s.recents);
  const hydrate = useNavStore((s) => s.hydrate);
  const toggleCollapsed = useNavStore((s) => s.toggleCollapsed);
  const toggleGroup = useNavStore((s) => s.toggleGroup);
  const toggleFavorite = useNavStore((s) => s.toggleFavorite);
  const recordVisit = useNavStore((s) => s.recordVisit);

  const [query, setQuery] = useState("");

  useEffect(() => hydrate(), [hydrate]);

  // Modules are undefined until the request lands, and `visibleGroups` shows
  // everything in that case — a menu that flickers empty on every page load
  // would be worse than briefly offering a link the API will refuse.
  const { data: entitlements } = useSchoolModules();
  const groups = useMemo(
    () => visibleGroups(userRoles ?? [], entitlements?.modules),
    [userRoles, entitlements?.modules],
  );
  const active = useMemo(() => findActiveLeaf(groups, pathname), [groups, pathname]);

  // Record the visit and auto-open the owning group when the route changes.
  useEffect(() => {
    if (!active) return;
    recordVisit(active.leaf.key);
    if (!useNavStore.getState().expandedGroups.includes(active.group.key)) {
      toggleGroup(active.group.key);
    }
    // Only re-run when the matched leaf changes, not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.leaf.key]);

  const allLeaves = useMemo(() => flattenLeaves(groups), [groups]);

  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return null;
    return allLeaves.filter(({ leaf }) => t(asKey(leaf.key)).toLowerCase().includes(trimmed));
  }, [query, allLeaves, t]);

  const favoriteLeaves = useMemo(
    () => favorites.map((key) => allLeaves.find((entry) => entry.leaf.key === key)).filter(Boolean),
    [favorites, allLeaves],
  ) as { group: NavGroup; leaf: NavLeaf }[];

  const recentLeaves = useMemo(
    () => recents.map((key) => allLeaves.find((entry) => entry.leaf.key === key)).filter(Boolean),
    [recents, allLeaves],
  ) as { group: NavGroup; leaf: NavLeaf }[];

  return (
    <aside
      className={clsx(
        "flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-950",
        collapsed ? "w-16" : "w-64",
      )}
      aria-label={t("app.name")}
    >
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-800">
        {/* A school's own mark stays visible when the sidebar is collapsed —
            it is the one thing in the rail that says whose console this is,
            and it is exactly what an admin looks for to check they are in
            the right school. */}
        {branding && <SchoolMark branding={branding} size="sm" className="shrink-0" />}
        {!collapsed &&
          (branding ? (
            <Link href="/dashboard" className="truncate text-base font-bold tracking-tight">
              {branding.schoolName}
            </Link>
          ) : (
            <Link href="/dashboard" className="truncate text-base font-bold tracking-tight">
              Wisdom <span className="text-brand-500">Campus</span>
            </Link>
          ))}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          className="ml-auto rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-900"
        >
          <ChevronIcon className={clsx("h-4 w-4 transition-transform", !collapsed && "rotate-180")} />
        </button>
      </div>

      {!collapsed && (
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            aria-label={t("sidebar.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">{t("sidebar.noResults")}</p>
          ) : (
            <ul className="space-y-0.5">
              {searchResults.map(({ group, leaf }) => (
                <LeafRow
                  key={leaf.key}
                  leaf={leaf}
                  groupKey={group.key}
                  collapsed={false}
                  isActive={active?.leaf.key === leaf.key}
                  isFavorite={favorites.includes(leaf.key)}
                  onToggleFavorite={toggleFavorite}
                  showGroupName
                />
              ))}
            </ul>
          )
        ) : (
          <>
            {!collapsed && favoriteLeaves.length > 0 && (
              <NavSection title={t("sidebar.favorites")}>
                {favoriteLeaves.map(({ group, leaf }) => (
                  <LeafRow
                    key={`fav-${leaf.key}`}
                    leaf={leaf}
                    groupKey={group.key}
                    collapsed={false}
                    isActive={active?.leaf.key === leaf.key}
                    isFavorite
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </NavSection>
            )}

            {!collapsed && recentLeaves.length > 0 && (
              <NavSection title={t("sidebar.recent")}>
                {recentLeaves.map(({ group, leaf }) => (
                  <LeafRow
                    key={`recent-${leaf.key}`}
                    leaf={leaf}
                    groupKey={group.key}
                    collapsed={false}
                    isActive={active?.leaf.key === leaf.key}
                    isFavorite={favorites.includes(leaf.key)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </NavSection>
            )}

            <ul className="space-y-0.5">
              {groups.map((group) => {
                const expanded = expandedGroups.includes(group.key);
                const groupActive = active?.group.key === group.key;
                return (
                  <li key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={expanded}
                      title={collapsed ? t(asKey(group.key)) : undefined}
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                        groupActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900",
                      )}
                    >
                      <NavIconGlyph name={group.icon} className="h-5 w-5 shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate text-left">{t(asKey(group.key))}</span>
                          <ChevronIcon
                            className={clsx("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-90")}
                          />
                        </>
                      )}
                    </button>

                    {expanded && !collapsed && (
                      <ul className="mt-0.5 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-800">
                        {group.items.map((leaf) => (
                          <LeafRow
                            key={leaf.key}
                            leaf={leaf}
                            groupKey={group.key}
                            collapsed={collapsed}
                            isActive={active?.leaf.key === leaf.key}
                            isFavorite={favorites.includes(leaf.key)}
                            onToggleFavorite={toggleFavorite}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>
    </aside>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function LeafRow({
  leaf,
  groupKey,
  isActive,
  isFavorite,
  onToggleFavorite,
  showGroupName,
}: {
  leaf: NavLeaf;
  groupKey: string;
  collapsed: boolean;
  isActive: boolean;
  isFavorite: boolean;
  onToggleFavorite: (key: string) => void;
  showGroupName?: boolean;
}) {
  const { t } = useTranslation();
  const label = t(asKey(leaf.key));
  const groupLabel = t(asKey(groupKey));

  const favoriteButton = (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleFavorite(leaf.key);
      }}
      aria-label={isFavorite ? t("sidebar.removeFavorite") : t("sidebar.addFavorite")}
      className={clsx(
        "shrink-0 rounded p-1 transition",
        isFavorite ? "text-amber-500" : "text-slate-300 opacity-0 hover:text-amber-500 group-hover:opacity-100",
      )}
    >
      <StarIcon filled={isFavorite} className="h-3.5 w-3.5" />
    </button>
  );

  // No href means the module is part of the agreed structure but isn't built
  // yet. Render it as disabled text, never as a link that would 404.
  if (!leaf.href) {
    return (
      <li>
        <div
          aria-disabled="true"
          title={t("sidebar.planned")}
          className="flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 dark:text-slate-600"
        >
          <span className="flex-1 truncate">
            {label}
            {/* Search flattens the tree, so without this two modules that
                share a label (Students/Attendance vs Staff/Attendance) are
                indistinguishable in the results. */}
            {showGroupName && <span className="ml-1 text-xs opacity-70">· {groupLabel}</span>}
          </span>
          <span className="shrink-0 rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-600">
            {t("sidebar.plannedShort")}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li className="group">
      <Link
        href={leaf.href}
        aria-current={isActive ? "page" : undefined}
        className={clsx(
          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition",
          isActive
            ? "bg-brand-gradient font-medium text-white"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900",
        )}
      >
        <span className="flex-1 truncate">
          {label}
          {showGroupName && <span className="ml-1 text-xs opacity-60">· {groupLabel}</span>}
        </span>
        {favoriteButton}
      </Link>
    </li>
  );
}
