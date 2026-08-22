"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MovieCardProps } from "@/components/MovieCard";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

interface UserPreferencesState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  preferencesReady: boolean;
  isAuthModalOpen: boolean;
  authModalMode: "signin" | "signup";

  liked: MovieCardProps[];
  disliked: MovieCardProps[];
  watched: MovieCardProps[];
  watchlist: MovieCardProps[];
  possible: MovieCardProps[];

  openAuthModal: (mode?: "signin" | "signup") => void;
  closeAuthModal: () => void;
  checkAuth: () => Promise<void>;
  setPreferencesReady: (ready: boolean) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;

  toggleLike: (item: MovieCardProps) => Promise<void>;
  toggleDislike: (item: MovieCardProps) => Promise<void>;
  toggleWatched: (item: MovieCardProps) => Promise<void>;
  toggleWatchlist: (item: MovieCardProps) => Promise<void>;
  togglePossible: (item: MovieCardProps) => Promise<void>;
}

const getItemKey = (item: MovieCardProps) => {
  const wid = item.watchmodeId ?? item.id;
  const t = item.type ?? "movie";
  return `${wid}_${t}`;
};

const toggleItem = (list: MovieCardProps[], item: MovieCardProps) => {
  const targetKey = getItemKey(item);
  const exists = list.some((i) => getItemKey(i) === targetKey);
  if (exists) {
    return list.filter((i) => getItemKey(i) !== targetKey);
  }
  return [...list, item];
};

async function normalizeAndResolveMedia(item: MovieCardProps): Promise<MovieCardProps> {
  const finalItem: MovieCardProps = { ...item };
  
  // Normalize watchmodeId and id
  if (!finalItem.watchmodeId) {
    finalItem.watchmodeId = finalItem.id;
  }
  if (!finalItem.id && finalItem.watchmodeId) {
    finalItem.id = typeof finalItem.watchmodeId === "number" ? finalItem.watchmodeId : parseInt(String(finalItem.watchmodeId));
  }
  
  // Normalize IDs
  const tmdb = finalItem.tmdbId || finalItem.tmdb_id;
  const imdb = finalItem.imdbId || finalItem.imdb_id;
  if (tmdb) {
    finalItem.tmdbId = tmdb;
    finalItem.tmdb_id = String(tmdb);
  }
  if (imdb) {
    finalItem.imdbId = imdb;
    finalItem.imdb_id = String(imdb);
  }

  // Check if resolution is needed
  if (finalItem.type === "series" || finalItem.type === "tv") {
    finalItem.movieLensId = null;
    finalItem.ml_id = undefined;
    finalItem.resolved = true;
    finalItem.resolvableByML = false;
    return finalItem;
  }

  if (finalItem.movieLensId === undefined && finalItem.ml_id === undefined && !finalItem.resolved) {
    try {
      const { fetchMovieLensId } = await import("@/app/actions/recommendations");
      const { resolved, ml_id, imdbId, tmdbId } = await fetchMovieLensId(
        finalItem.title, 
        finalItem.year || finalItem.release_date, 
        finalItem.type || "movie", 
        finalItem.tmdbId, 
        finalItem.imdbId
      );
      
      finalItem.resolved = resolved;
      finalItem.movieLensId = ml_id || null;
      finalItem.ml_id = ml_id || undefined;
      finalItem.resolvableByML = !!ml_id;
      if (imdbId && !finalItem.imdbId) finalItem.imdbId = imdbId;
      if (tmdbId && !finalItem.tmdbId) finalItem.tmdbId = tmdbId;
    } catch (e) {
      console.warn("Failed to resolve movie lens ID:", e);
      finalItem.resolved = false;
      finalItem.movieLensId = null;
      finalItem.resolvableByML = false;
    }
  } else if (finalItem.movieLensId || finalItem.ml_id) {
    finalItem.movieLensId = finalItem.movieLensId || finalItem.ml_id || null;
    finalItem.ml_id = (finalItem.movieLensId as number) || finalItem.ml_id || undefined;
    finalItem.resolvableByML = true;
    finalItem.resolved = true;
  }

  return finalItem;
}

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      authLoading: false,
      preferencesReady: false,
      isAuthModalOpen: false,
      authModalMode: "signin",

      liked: [],
      disliked: [],
      watched: [],
      watchlist: [],
      possible: [],

      setPreferencesReady: (ready: boolean) => {
        set({ preferencesReady: ready });
      },

      openAuthModal: (mode = "signin") => {
        set({ isAuthModalOpen: true, authModalMode: mode });
      },

      closeAuthModal: () => {
        set({ isAuthModalOpen: false });
      },

      checkAuth: async () => {
        try {
          set({ authLoading: true });
          const res = await fetch("/api/auth/me");
          let data: any = null;
          try {
            const text = await res.text();
            if (text) data = JSON.parse(text);
          } catch {
            data = null;
          }

          if (res.ok && data?.user) {
            set({
              user: {
                id: data.user.id,
                name: data.user.name,
                email: data.user.email,
                createdAt: data.user.createdAt,
              },
              isAuthenticated: true,
              liked: Array.isArray(data.user.likedMedia) ? data.user.likedMedia : [],
              disliked: Array.isArray(data.user.dislikedMedia) ? data.user.dislikedMedia : [],
              watched: Array.isArray(data.user.watchedMedia) ? data.user.watchedMedia : [],
              watchlist: Array.isArray(data.user.watchlist) ? data.user.watchlist : [],
              possible: Array.isArray(data.user.possibleToWatch) ? data.user.possibleToWatch : [],
              preferencesReady: true,
            });
          } else {
            set({ user: null, isAuthenticated: false, preferencesReady: true });
          }
        } catch (e) {
          console.warn("checkAuth error:", e);
          set({ user: null, isAuthenticated: false, preferencesReady: true });
        } finally {
          set({ authLoading: false, preferencesReady: true });
        }
      },

      login: async (email, password) => {
        try {
          set({ authLoading: true });
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          let data: any = null;
          try {
            const text = await res.text();
            if (text) data = JSON.parse(text);
          } catch {
            data = null;
          }

          if (!res.ok || !data?.success) {
            const errorMessage = data?.message || data?.error || "Failed to log in";
            return { success: false, error: errorMessage };
          }

          set({
            user: {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              createdAt: data.user.createdAt,
            },
            isAuthenticated: true,
            liked: Array.isArray(data.user.likedMedia) ? data.user.likedMedia : [],
            disliked: Array.isArray(data.user.dislikedMedia) ? data.user.dislikedMedia : [],
            watched: Array.isArray(data.user.watchedMedia) ? data.user.watchedMedia : [],
            watchlist: Array.isArray(data.user.watchlist) ? data.user.watchlist : [],
            possible: Array.isArray(data.user.possibleToWatch) ? data.user.possibleToWatch : [],
            isAuthModalOpen: false,
            preferencesReady: true,
          });

          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message || "Failed to log in" };
        } finally {
          set({ authLoading: false, preferencesReady: true });
        }
      },

      register: async (name, email, password) => {
        try {
          set({ authLoading: true });
          const state = get();
          const initialPreferences = {
            liked: state.liked,
            disliked: state.disliked,
            watched: state.watched,
            watchlist: state.watchlist,
            possible: state.possible,
          };

          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, initialPreferences }),
          });

          let data: any = null;
          try {
            const text = await res.text();
            if (text) data = JSON.parse(text);
          } catch {
            data = null;
          }

          if (!res.ok || !data?.success) {
            const errorMessage = data?.message || data?.error || "Failed to register";
            return { success: false, error: errorMessage };
          }

          set({
            user: {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              createdAt: data.user.createdAt,
            },
            isAuthenticated: true,
            liked: Array.isArray(data.user.likedMedia) ? data.user.likedMedia : [],
            disliked: Array.isArray(data.user.dislikedMedia) ? data.user.dislikedMedia : [],
            watched: Array.isArray(data.user.watchedMedia) ? data.user.watchedMedia : [],
            watchlist: Array.isArray(data.user.watchlist) ? data.user.watchlist : [],
            possible: Array.isArray(data.user.possibleToWatch) ? data.user.possibleToWatch : [],
            isAuthModalOpen: false,
            preferencesReady: true,
          });

          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message || "Failed to register" };
        } finally {
          set({ authLoading: false, preferencesReady: true });
        }
      },

      logout: async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch (e) {
          console.warn("Logout error:", e);
        }
        set({
          user: null,
          isAuthenticated: false,
          liked: [],
          disliked: [],
          watched: [],
          watchlist: [],
          possible: [],
          preferencesReady: true,
        });
      },

      toggleLike: async (item) => {
        const finalItem = await normalizeAndResolveMedia(item);
        const state = get();
        const targetKey = getItemKey(finalItem);
        const isCurrentlyLiked = state.liked.some((i) => getItemKey(i) === targetKey);
        
        console.log("LIKE ACTION:", finalItem.title, "| MovieLens ID:", finalItem.movieLensId, "| TMDB:", finalItem.tmdbId, "| IMDb:", finalItem.imdbId);

        // Optimistic UI update
        set({
          liked: isCurrentlyLiked 
            ? state.liked.filter((i) => getItemKey(i) !== targetKey) 
            : [...state.liked, finalItem],
          disliked: state.disliked.filter((i) => getItemKey(i) !== targetKey),
          preferencesReady: true,
        });

        // Server sync if authenticated
        if (state.isAuthenticated) {
          try {
            await fetch("/api/preferences/like", {
              method: isCurrentlyLiked ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(finalItem),
            });
          } catch (err) {
            console.error("Failed to sync like to server:", err);
          }
        }
      },

      toggleDislike: async (item) => {
        const finalItem = await normalizeAndResolveMedia(item);
        const state = get();
        const targetKey = getItemKey(finalItem);
        const isCurrentlyDisliked = state.disliked.some((i) => getItemKey(i) === targetKey);

        // Optimistic UI update
        set({
          disliked: isCurrentlyDisliked 
            ? state.disliked.filter((i) => getItemKey(i) !== targetKey) 
            : [...state.disliked, finalItem],
          liked: state.liked.filter((i) => getItemKey(i) !== targetKey),
          preferencesReady: true,
        });

        // Server sync if authenticated
        if (state.isAuthenticated) {
          try {
            await fetch("/api/preferences/dislike", {
              method: isCurrentlyDisliked ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(finalItem),
            });
          } catch (err) {
            console.error("Failed to sync dislike to server:", err);
          }
        }
      },

      toggleWatched: async (item) => {
        const finalItem = await normalizeAndResolveMedia(item);
        const state = get();
        const targetKey = getItemKey(finalItem);
        const isCurrentlyWatched = state.watched.some((i) => getItemKey(i) === targetKey);

        set({
          watched: toggleItem(state.watched, finalItem),
          preferencesReady: true,
        });

        if (state.isAuthenticated) {
          try {
            await fetch("/api/preferences/watched", {
              method: isCurrentlyWatched ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(finalItem),
            });
          } catch (err) {
            console.error("Failed to sync watched to server:", err);
          }
        }
      },

      toggleWatchlist: async (item) => {
        const finalItem = await normalizeAndResolveMedia(item);
        const state = get();
        const targetKey = getItemKey(finalItem);
        const isCurrentlyInWatchlist = state.watchlist.some((i) => getItemKey(i) === targetKey);

        set({
          watchlist: toggleItem(state.watchlist, finalItem),
          preferencesReady: true,
        });

        if (state.isAuthenticated) {
          try {
            await fetch("/api/preferences/watchlist", {
              method: isCurrentlyInWatchlist ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(finalItem),
            });
          } catch (err) {
            console.error("Failed to sync watchlist to server:", err);
          }
        }
      },

      togglePossible: async (item) => {
        const finalItem = await normalizeAndResolveMedia(item);
        const state = get();
        const targetKey = getItemKey(finalItem);
        const isCurrentlyPossible = state.possible.some((i) => getItemKey(i) === targetKey);

        set({
          possible: toggleItem(state.possible, finalItem),
          preferencesReady: true,
        });

        if (state.isAuthenticated) {
          try {
            await fetch("/api/preferences/possible", {
              method: isCurrentlyPossible ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(finalItem),
            });
          } catch (err) {
            console.error("Failed to sync possible to server:", err);
          }
        }
      },
    }),
    {
      name: "flixrec_preferences",
      partialize: (state) => ({
        liked: state.liked,
        disliked: state.disliked,
        watched: state.watched,
        watchlist: state.watchlist,
        possible: state.possible,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setPreferencesReady(true);
        }
      },
    }
  )
);
