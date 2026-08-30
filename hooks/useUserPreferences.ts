"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MovieCardProps } from "@/components/MovieCard";
import {
  isMediaInList,
  toggleMediaItem,
  removeMediaItem,
  addMediaItem,
  mergeMediaLists,
  getCanonicalMediaKey,
  isSameMedia,
  normalizeImdbId,
  normalizeTmdbId,
} from "@/lib/mediaIdentity";

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

/**
 * Fast synchronous media normalization
 */
function normalizeMediaItem(item: MovieCardProps): MovieCardProps {
  const copy: MovieCardProps = { ...item };

  if (!copy.watchmodeId && copy.id) {
    copy.watchmodeId = copy.id;
  }
  if (!copy.id && copy.watchmodeId) {
    copy.id = typeof copy.watchmodeId === "number" ? copy.watchmodeId : parseInt(String(copy.watchmodeId), 10);
  }

  const tmdb = copy.tmdbId || copy.tmdb_id;
  const imdb = copy.imdbId || copy.imdb_id;
  if (tmdb) {
    const normTmdb = normalizeTmdbId(tmdb);
    copy.tmdbId = normTmdb;
    copy.tmdb_id = normTmdb || undefined;
  }
  if (imdb) {
    const normImdb = normalizeImdbId(imdb);
    copy.imdbId = normImdb;
    copy.imdb_id = normImdb || undefined;
  }

  if (copy.type === "series" || copy.type === "tv") {
    copy.movieLensId = null;
    copy.ml_id = undefined;
    copy.resolved = true;
    copy.resolvableByML = false;
  } else if (copy.movieLensId || copy.ml_id) {
    const ml = Number(copy.movieLensId || copy.ml_id);
    if (!isNaN(ml) && ml > 0) {
      copy.movieLensId = ml;
      copy.ml_id = ml;
      copy.resolved = true;
      copy.resolvableByML = true;
    }
  }

  return copy;
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
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          let data: any = null;
          try {
            const text = await res.text();
            if (text) data = JSON.parse(text);
          } catch {
            data = null;
          }

          if (res.ok && data?.user) {
            const serverLiked = Array.isArray(data.user.likedMedia) ? data.user.likedMedia : [];
            const serverDisliked = Array.isArray(data.user.dislikedMedia) ? data.user.dislikedMedia : [];
            const serverWatched = Array.isArray(data.user.watchedMedia) ? data.user.watchedMedia : [];
            const serverWatchlist = Array.isArray(data.user.watchlist) ? data.user.watchlist : [];
            const serverPossible = Array.isArray(data.user.possibleToWatch) ? data.user.possibleToWatch : [];

            const localState = get();
            const hasLocalUnsynced =
              localState.liked.length > 0 ||
              localState.disliked.length > 0 ||
              localState.watched.length > 0 ||
              localState.watchlist.length > 0 ||
              localState.possible.length > 0;

            let finalLiked = serverLiked;
            let finalDisliked = serverDisliked;
            let finalWatched = serverWatched;
            let finalWatchlist = serverWatchlist;
            let finalPossible = serverPossible;

            // Merge local guest likes into server profile if any exist
            if (hasLocalUnsynced) {
              finalLiked = mergeMediaLists(serverLiked, localState.liked);
              finalDisliked = mergeMediaLists(serverDisliked, localState.disliked);
              finalWatched = mergeMediaLists(serverWatched, localState.watched);
              finalWatchlist = mergeMediaLists(serverWatchlist, localState.watchlist);
              finalPossible = mergeMediaLists(serverPossible, localState.possible);

              try {
                await fetch("/api/preferences/sync", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    liked: finalLiked,
                    disliked: finalDisliked,
                    watched: finalWatched,
                    watchlist: finalWatchlist,
                    possible: finalPossible,
                  }),
                });
              } catch (syncErr) {
                console.warn("[checkAuth] Non-fatal sync error:", syncErr);
              }
            }

            set({
              user: {
                id: data.user.id,
                name: data.user.name,
                email: data.user.email,
                createdAt: data.user.createdAt,
              },
              isAuthenticated: true,
              liked: finalLiked,
              disliked: finalDisliked,
              watched: finalWatched,
              watchlist: finalWatchlist,
              possible: finalPossible,
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

          const serverLiked = Array.isArray(data.user.likedMedia) ? data.user.likedMedia : [];
          const serverDisliked = Array.isArray(data.user.dislikedMedia) ? data.user.dislikedMedia : [];
          const serverWatched = Array.isArray(data.user.watchedMedia) ? data.user.watchedMedia : [];
          const serverWatchlist = Array.isArray(data.user.watchlist) ? data.user.watchlist : [];
          const serverPossible = Array.isArray(data.user.possibleToWatch) ? data.user.possibleToWatch : [];

          const localState = get();
          const finalLiked = mergeMediaLists(serverLiked, localState.liked);
          const finalDisliked = mergeMediaLists(serverDisliked, localState.disliked);
          const finalWatched = mergeMediaLists(serverWatched, localState.watched);
          const finalWatchlist = mergeMediaLists(serverWatchlist, localState.watchlist);
          const finalPossible = mergeMediaLists(serverPossible, localState.possible);

          if (
            localState.liked.length > 0 ||
            localState.disliked.length > 0 ||
            localState.watched.length > 0 ||
            localState.watchlist.length > 0 ||
            localState.possible.length > 0
          ) {
            try {
              await fetch("/api/preferences/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  liked: finalLiked,
                  disliked: finalDisliked,
                  watched: finalWatched,
                  watchlist: finalWatchlist,
                  possible: finalPossible,
                }),
              });
            } catch (syncErr) {
              console.warn("[login] Non-fatal sync error:", syncErr);
            }
          }

          set({
            user: {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              createdAt: data.user.createdAt,
            },
            isAuthenticated: true,
            liked: finalLiked,
            disliked: finalDisliked,
            watched: finalWatched,
            watchlist: finalWatchlist,
            possible: finalPossible,
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
            liked: Array.isArray(data.user.likedMedia) ? data.user.likedMedia : state.liked,
            disliked: Array.isArray(data.user.dislikedMedia) ? data.user.dislikedMedia : state.disliked,
            watched: Array.isArray(data.user.watchedMedia) ? data.user.watchedMedia : state.watched,
            watchlist: Array.isArray(data.user.watchlist) ? data.user.watchlist : state.watchlist,
            possible: Array.isArray(data.user.possibleToWatch) ? data.user.possibleToWatch : state.possible,
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

      toggleLike: async (rawItem: MovieCardProps) => {
        const item = normalizeMediaItem(rawItem);
        const state = get();
        const prevLiked = [...state.liked];
        const prevDisliked = [...state.disliked];
        const isCurrentlyLiked = isMediaInList(prevLiked, item);

        // 1. INSTANT SYNCHRONOUS OPTIMISTIC UPDATE
        const newLiked = isCurrentlyLiked ? removeMediaItem(prevLiked, item) : addMediaItem(prevLiked, item);
        const newDisliked = removeMediaItem(prevDisliked, item);

        set({
          liked: newLiked,
          disliked: newDisliked,
          preferencesReady: true,
        });

        // 2. ASYNC BACKGROUND RESOLUTION (only when adding a movie that lacks MovieLens ID)
        if (!isCurrentlyLiked) {
          const isSeries = item.type === "series" || item.type === "tv";
          if (!isSeries && !item.movieLensId && !item.ml_id) {
            (async () => {
              try {
                const { fetchMovieLensId } = await import("@/app/actions/recommendations");
                const res = await fetchMovieLensId(item);
                if (res.resolved && res.ml_id) {
                  const updatedItem: MovieCardProps = {
                    ...item,
                    movieLensId: res.ml_id,
                    ml_id: res.ml_id,
                    resolved: true,
                    resolvableByML: true,
                    imdbId: res.imdbId || item.imdbId,
                    tmdbId: res.tmdbId || item.tmdbId,
                  };
                  const currentState = get();
                  if (isMediaInList(currentState.liked, item)) {
                    set({
                      liked: currentState.liked.map((i) => (isSameMedia(i, item) ? { ...i, ...updatedItem } : i)),
                    });
                  }
                }
              } catch (e) {
                console.warn("[toggleLike] Background MovieLens resolution non-fatal error:", e);
              }
            })();
          }
        }

        // 3. SERVER SYNC (if authenticated) with rollback on failure
        if (state.isAuthenticated) {
          try {
            const res = await fetch("/api/preferences/like", {
              method: isCurrentlyLiked ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item),
            });
            if (!res.ok) {
              console.error("[toggleLike] Server sync failed. Rolling back optimistic update.");
              set({ liked: prevLiked, disliked: prevDisliked });
            }
          } catch (err) {
            console.error("[toggleLike] Network error syncing like to server:", err);
            set({ liked: prevLiked, disliked: prevDisliked });
          }
        }
      },

      toggleDislike: async (rawItem: MovieCardProps) => {
        const item = normalizeMediaItem(rawItem);
        const state = get();
        const prevDisliked = [...state.disliked];
        const prevLiked = [...state.liked];
        const isCurrentlyDisliked = isMediaInList(prevDisliked, item);

        // 1. INSTANT OPTIMISTIC UPDATE
        const newDisliked = isCurrentlyDisliked
          ? removeMediaItem(prevDisliked, item)
          : addMediaItem(prevDisliked, item);
        const newLiked = removeMediaItem(prevLiked, item);

        set({
          disliked: newDisliked,
          liked: newLiked,
          preferencesReady: true,
        });

        // 2. SERVER SYNC with rollback
        if (state.isAuthenticated) {
          try {
            const res = await fetch("/api/preferences/dislike", {
              method: isCurrentlyDisliked ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item),
            });
            if (!res.ok) {
              set({ disliked: prevDisliked, liked: prevLiked });
            }
          } catch (err) {
            console.error("[toggleDislike] Failed to sync dislike to server:", err);
            set({ disliked: prevDisliked, liked: prevLiked });
          }
        }
      },

      toggleWatched: async (rawItem: MovieCardProps) => {
        const item = normalizeMediaItem(rawItem);
        const state = get();
        const prevWatched = [...state.watched];
        const isCurrentlyWatched = isMediaInList(prevWatched, item);

        // 1. INSTANT OPTIMISTIC UPDATE
        const newWatched = toggleMediaItem(prevWatched, item);
        set({
          watched: newWatched,
          preferencesReady: true,
        });

        // 2. SERVER SYNC with rollback
        if (state.isAuthenticated) {
          try {
            const res = await fetch("/api/preferences/watched", {
              method: isCurrentlyWatched ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item),
            });
            if (!res.ok) {
              set({ watched: prevWatched });
            }
          } catch (err) {
            console.error("[toggleWatched] Failed to sync watched to server:", err);
            set({ watched: prevWatched });
          }
        }
      },

      toggleWatchlist: async (rawItem: MovieCardProps) => {
        const item = normalizeMediaItem(rawItem);
        const state = get();
        const prevWatchlist = [...state.watchlist];
        const isCurrentlyInWatchlist = isMediaInList(prevWatchlist, item);

        // 1. INSTANT OPTIMISTIC UPDATE
        const newWatchlist = toggleMediaItem(prevWatchlist, item);
        set({
          watchlist: newWatchlist,
          preferencesReady: true,
        });

        // 2. SERVER SYNC with rollback
        if (state.isAuthenticated) {
          try {
            const res = await fetch("/api/preferences/watchlist", {
              method: isCurrentlyInWatchlist ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item),
            });
            if (!res.ok) {
              set({ watchlist: prevWatchlist });
            }
          } catch (err) {
            console.error("[toggleWatchlist] Failed to sync watchlist to server:", err);
            set({ watchlist: prevWatchlist });
          }
        }
      },

      togglePossible: async (rawItem: MovieCardProps) => {
        const item = normalizeMediaItem(rawItem);
        const state = get();
        const prevPossible = [...state.possible];
        const isCurrentlyPossible = isMediaInList(prevPossible, item);

        // 1. INSTANT OPTIMISTIC UPDATE
        const newPossible = toggleMediaItem(prevPossible, item);
        set({
          possible: newPossible,
          preferencesReady: true,
        });

        // 2. SERVER SYNC with rollback
        if (state.isAuthenticated) {
          try {
            const res = await fetch("/api/preferences/possible", {
              method: isCurrentlyPossible ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item),
            });
            if (!res.ok) {
              set({ possible: prevPossible });
            }
          } catch (err) {
            console.error("[togglePossible] Failed to sync possible to server:", err);
            set({ possible: prevPossible });
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

