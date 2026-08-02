"use client";

import { create } from "zustand";

const STORAGE_KEY = "wisdom-campus-nav";
const MAX_RECENTS = 6;

interface PersistedNav {
  collapsed: boolean;
  expandedGroups: string[];
  favorites: string[];
  recents: string[];
}

interface NavState extends PersistedNav {
  hydrated: boolean;
  hydrate: () => void;
  toggleCollapsed: () => void;
  toggleGroup: (key: string) => void;
  toggleFavorite: (key: string) => void;
  recordVisit: (key: string) => void;
}

function persist(state: PersistedNav) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private-mode / quota failures must never break navigation.
  }
}

function snapshot(state: NavState): PersistedNav {
  return {
    collapsed: state.collapsed,
    expandedGroups: state.expandedGroups,
    favorites: state.favorites,
    recents: state.recents,
  };
}

/**
 * Sidebar UI state. Hydrated from localStorage in an effect rather than in
 * the initializer so the server render and the first client render match —
 * the same reasoning as the locale and theme providers.
 */
export const useNavStore = create<NavState>((set, get) => ({
  collapsed: false,
  expandedGroups: [],
  favorites: [],
  recents: [],
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedNav>;
        set({
          collapsed: parsed.collapsed ?? false,
          expandedGroups: parsed.expandedGroups ?? [],
          favorites: parsed.favorites ?? [],
          recents: parsed.recents ?? [],
        });
      }
    } catch {
      // Corrupt stored state falls back to defaults rather than crashing.
    }
    set({ hydrated: true });
  },

  toggleCollapsed: () => {
    set({ collapsed: !get().collapsed });
    persist(snapshot(get()));
  },

  toggleGroup: (key) => {
    const expanded = get().expandedGroups;
    set({
      expandedGroups: expanded.includes(key) ? expanded.filter((k) => k !== key) : [...expanded, key],
    });
    persist(snapshot(get()));
  },

  toggleFavorite: (key) => {
    const favorites = get().favorites;
    set({
      favorites: favorites.includes(key) ? favorites.filter((k) => k !== key) : [...favorites, key],
    });
    persist(snapshot(get()));
  },

  recordVisit: (key) => {
    const recents = [key, ...get().recents.filter((k) => k !== key)].slice(0, MAX_RECENTS);
    set({ recents });
    persist(snapshot(get()));
  },
}));
