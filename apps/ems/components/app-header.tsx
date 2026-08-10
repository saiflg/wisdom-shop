"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useAuthStore } from "@/store/auth-store";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { LOCALES, LOCALE_LABELS, isComplete, type TranslationKey } from "@/lib/i18n";
import { useTheme, THEMES, type Theme } from "@/lib/theme-provider";
import { findActiveLeaf, flattenLeaves, visibleGroups } from "@/lib/navigation";
import { useSchoolModules } from "@/lib/use-school-modules";

function asKey(key: string): TranslationKey {
  return key as TranslationKey;
}

/** Explicit map rather than building the key by concatenation — that needed a cast. */
const THEME_LABEL_KEYS: Record<Theme, TranslationKey> = {
  light: "header.themeLight",
  dark: "header.themeDark",
  system: "header.themeSystem",
};

/**
 * Global controls only — per the ERP layout, module navigation lives in the
 * sidebar and must never appear up here.
 */
export function AppHeader() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [openMenu, setOpenMenu] = useState<"none" | "notifications" | "language" | "theme" | "profile">("none");
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: entitlements } = useSchoolModules();
  const groups = useMemo(
    () => visibleGroups(user?.roles ?? [], entitlements?.modules),
    [user?.roles, entitlements?.modules],
  );
  const active = useMemo(() => findActiveLeaf(groups, pathname), [groups, pathname]);

  const searchResults = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return [];
    return flattenLeaves(groups)
      .filter(({ leaf }) => leaf.href && t(asKey(leaf.key)).toLowerCase().includes(trimmed))
      .slice(0, 6);
  }, [search, groups, t]);

  // Close any open dropdown on an outside click.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpenMenu("none");
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const toggle = (menu: typeof openMenu) => setOpenMenu((current) => (current === menu ? "none" : menu));

  return (
    <header
      ref={containerRef}
      className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="relative w-full max-w-sm">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("header.searchPlaceholder")}
          aria-label={t("header.search")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
        {searchResults.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
            {searchResults.map(({ group, leaf }) => (
              <li key={leaf.key}>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    router.push(leaf.href as string);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t(asKey(leaf.key))}
                  <span className="ml-1 text-xs text-slate-500">· {t(asKey(group.key))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <HeaderButton label={t("header.aiAssistant")} onClick={() => toggle("none")} disabled>
          ✨
        </HeaderButton>

        <div className="relative">
          <HeaderButton label={t("header.notifications")} onClick={() => toggle("notifications")}>
            🔔
          </HeaderButton>
          {openMenu === "notifications" && (
            <Dropdown>
              <p className="px-3 py-2 text-sm text-slate-500">{t("header.noNotifications")}</p>
            </Dropdown>
          )}
        </div>

        <div className="relative">
          <HeaderButton label={t("header.language")} onClick={() => toggle("language")}>
            <span className="text-xs font-semibold uppercase">{locale}</span>
          </HeaderButton>
          {openMenu === "language" && (
            <Dropdown>
              {LOCALES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setLocale(option);
                    setOpenMenu("none");
                  }}
                  className={clsx(
                    "block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800",
                    option === locale && "font-semibold text-brand-600 dark:text-brand-400",
                  )}
                >
                  {LOCALE_LABELS[option]}
                  {!isComplete(option) && <span className="ml-1 text-xs text-slate-400">(partial)</span>}
                </button>
              ))}
            </Dropdown>
          )}
        </div>

        <div className="relative">
          <HeaderButton label={t("header.theme")} onClick={() => toggle("theme")}>
            {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥️"}
          </HeaderButton>
          {openMenu === "theme" && (
            <Dropdown>
              {THEMES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setTheme(option);
                    setOpenMenu("none");
                  }}
                  className={clsx(
                    "block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800",
                    option === theme && "font-semibold text-brand-600 dark:text-brand-400",
                  )}
                >
                  {t(THEME_LABEL_KEYS[option])}
                </button>
              ))}
            </Dropdown>
          )}
        </div>

        {user && (
          <span className="ml-2 hidden truncate text-sm font-medium text-slate-700 dark:text-slate-300 sm:inline">
            {user.schoolSlug}
          </span>
        )}

        <div className="relative">
          <HeaderButton label={t("header.profile")} onClick={() => toggle("profile")}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white">
              {(user?.schoolSlug ?? "?").charAt(0).toUpperCase()}
            </span>
          </HeaderButton>
          {openMenu === "profile" && (
            <Dropdown>
              <p className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">
                {user?.roles.join(", ")}
              </p>
              <button
                type="button"
                onClick={() => {
                  clearSession();
                  window.location.href = "/login";
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t("header.signOut")}
              </button>
            </Dropdown>
          )}
        </div>
      </div>

      {/* Breadcrumb lives under the controls on small screens; see layout. */}
      <span className="sr-only">
        {active ? `${t(asKey(active.group.key))} / ${t(asKey(active.leaf.key))}` : t("breadcrumb.home")}
      </span>
    </header>
  );
}

function HeaderButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-900"
    >
      {children}
    </button>
  );
}

function Dropdown({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
      {children}
    </div>
  );
}

/** Breadcrumb trail for the current route, rendered by the dashboard layout. */
export function Breadcrumbs() {
  const pathname = usePathname() ?? "";
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { data: entitlements } = useSchoolModules();
  const groups = useMemo(
    () => visibleGroups(user?.roles ?? [], entitlements?.modules),
    [user?.roles, entitlements?.modules],
  );
  const active = useMemo(() => findActiveLeaf(groups, pathname), [groups, pathname]);

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-slate-500">
      <Link href="/dashboard" className="hover:underline">
        {t("breadcrumb.home")}
      </Link>
      {active && (
        <>
          <span aria-hidden="true">/</span>
          <span>{t(asKey(active.group.key))}</span>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">{t(asKey(active.leaf.key))}</span>
        </>
      )}
    </nav>
  );
}
