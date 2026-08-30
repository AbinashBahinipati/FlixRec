import { MediaItem } from "@/components/MovieCard";

/**
 * Normalizes movie and series titles for matching:
 * - Strips trailing year in parentheses: "The Matrix (1999)" -> "The Matrix"
 * - Inverts trailing articles: "Matrix, The" -> "The Matrix", "Godfather: Part II, The" -> "The Godfather: Part II"
 * - Strips punctuation and extra whitespace
 * - Converts to lower case
 */
export function cleanMediaTitle(t: string | null | undefined): string {
  if (!t || typeof t !== "string") return "";
  let clean = t.replace(/\s*\(\d{4}\)$/, "").trim();
  const match = clean.match(/^(.*?),\s*(The|A|An)$/i);
  if (match) {
    clean = `${match[2]} ${match[1]}`;
  }
  clean = clean.replace(/[^\w\s]/g, "");
  return clean.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Normalizes IMDb IDs to lowercase string (e.g., "tt0133093", "0133093" -> "tt0133093")
 */
export function normalizeImdbId(imdb: string | number | null | undefined): string | null {
  if (!imdb) return null;
  const s = String(imdb).trim().toLowerCase();
  if (!s || s === "nan" || s === "null") return null;
  if (s.startsWith("tt")) {
    const digits = s.slice(2);
    if (/^\d+$/.test(digits)) {
      return `tt${digits.padStart(7, "0")}`;
    }
    return s;
  }
  if (/^\d+$/.test(s)) {
    return `tt${s.padStart(7, "0")}`;
  }
  return s;
}

/**
 * Normalizes TMDB IDs (strips .0 and spaces)
 */
export function normalizeTmdbId(tmdb: string | number | null | undefined): string | null {
  if (!tmdb) return null;
  let s = String(tmdb).trim();
  if (!s || s === "nan" || s === "null") return null;
  if (s.endsWith(".0")) {
    s = s.slice(0, -2);
  }
  if (/^\d+$/.test(s)) {
    return String(parseInt(s, 10));
  }
  return s;
}

/**
 * Returns a canonical, deterministic key for any MediaItem
 * Priority: MovieLens ID > TMDB ID > IMDb ID > Watchmode ID > Title + Year
 */
export function getCanonicalMediaKey(item: MediaItem): string {
  const type = item.type === "series" || item.type === "tv" ? "series" : "movie";

  const mlId = item.movieLensId ?? item.ml_id;
  if (typeof mlId === "number" && !isNaN(mlId) && mlId > 0) {
    return `ml_${mlId}`;
  }

  const tmdb = normalizeTmdbId(item.tmdbId ?? item.tmdb_id);
  if (tmdb) {
    return `tmdb_${tmdb}_${type}`;
  }

  const imdb = normalizeImdbId(item.imdbId ?? item.imdb_id);
  if (imdb) {
    return `imdb_${imdb}`;
  }

  const wid = item.watchmodeId ?? item.id;
  if (wid !== undefined && wid !== null && String(wid).trim() !== "") {
    return `wm_${wid}_${type}`;
  }

  const normTitle = cleanMediaTitle(item.title);
  const year = item.year ? String(item.year).slice(0, 4) : "";
  return `title_${normTitle}_${year}_${type}`;
}

/**
 * Determines whether two MediaItem objects represent the exact same title
 */
export function isSameMedia(a: MediaItem, b: MediaItem): boolean {
  if (!a || !b) return false;

  const aType = a.type === "series" || a.type === "tv" ? "series" : "movie";
  const bType = b.type === "series" || b.type === "tv" ? "series" : "movie";

  // Check MovieLens ID (only applicable for movies)
  const aMl = a.movieLensId ?? a.ml_id;
  const bMl = b.movieLensId ?? b.ml_id;
  if (
    typeof aMl === "number" &&
    typeof bMl === "number" &&
    !isNaN(aMl) &&
    !isNaN(bMl) &&
    aMl > 0 &&
    bMl > 0
  ) {
    if (aMl === bMl) return true;
  }

  // Check TMDB ID
  const aTmdb = normalizeTmdbId(a.tmdbId ?? a.tmdb_id);
  const bTmdb = normalizeTmdbId(b.tmdbId ?? b.tmdb_id);
  if (aTmdb && bTmdb && aTmdb === bTmdb) {
    return aType === bType;
  }

  // Check IMDb ID
  const aImdb = normalizeImdbId(a.imdbId ?? a.imdb_id);
  const bImdb = normalizeImdbId(b.imdbId ?? b.imdb_id);
  if (aImdb && bImdb && aImdb === bImdb) {
    return true;
  }

  // Check Watchmode ID / ID
  const aWid = a.watchmodeId ?? a.id;
  const bWid = b.watchmodeId ?? b.id;
  if (
    aWid !== undefined &&
    bWid !== undefined &&
    aWid !== null &&
    bWid !== null &&
    String(aWid) === String(bWid)
  ) {
    return aType === bType;
  }

  // Fallback: Title + Year + Type
  if (a.title && b.title) {
    const aClean = cleanMediaTitle(a.title);
    const bClean = cleanMediaTitle(b.title);
    if (aClean && bClean && aClean === bClean && aType === bType) {
      const aYear = a.year ? String(a.year).slice(0, 4) : "";
      const bYear = b.year ? String(b.year).slice(0, 4) : "";
      if (aYear && bYear) {
        return aYear === bYear;
      }
      return true;
    }
  }

  return false;
}

/**
 * Checks if an item exists in a MediaItem list
 */
export function isMediaInList(list: MediaItem[] = [], item: MediaItem): boolean {
  if (!Array.isArray(list) || list.length === 0 || !item) return false;
  const targetKey = getCanonicalMediaKey(item);
  return list.some((i) => getCanonicalMediaKey(i) === targetKey || isSameMedia(i, item));
}

/**
 * Toggles a media item in a list (adds if missing, removes if present)
 */
export function toggleMediaItem(list: MediaItem[] = [], item: MediaItem): MediaItem[] {
  if (!item) return list || [];
  const targetKey = getCanonicalMediaKey(item);
  const exists = list.some((i) => getCanonicalMediaKey(i) === targetKey || isSameMedia(i, item));
  if (exists) {
    return list.filter((i) => getCanonicalMediaKey(i) !== targetKey && !isSameMedia(i, item));
  }
  return [...list, item];
}

/**
 * Removes a media item from a list
 */
export function removeMediaItem(list: MediaItem[] = [], item: MediaItem): MediaItem[] {
  if (!item || !Array.isArray(list)) return list || [];
  const targetKey = getCanonicalMediaKey(item);
  return list.filter((i) => getCanonicalMediaKey(i) !== targetKey && !isSameMedia(i, item));
}

/**
 * Adds a media item to a list without duplicates
 */
export function addMediaItem(list: MediaItem[] = [], item: MediaItem): MediaItem[] {
  if (!item) return list || [];
  const targetKey = getCanonicalMediaKey(item);
  const filtered = (list || []).filter(
    (i) => getCanonicalMediaKey(i) !== targetKey && !isSameMedia(i, item)
  );
  return [...filtered, item];
}

/**
 * Merges two lists of media items, preserving newer/more complete metadata
 */
export function mergeMediaLists(existing: MediaItem[] = [], incoming: MediaItem[] = []): MediaItem[] {
  const result: MediaItem[] = [...(existing || [])];

  for (const item of incoming || []) {
    const targetKey = getCanonicalMediaKey(item);
    const existingIndex = result.findIndex(
      (i) => getCanonicalMediaKey(i) === targetKey || isSameMedia(i, item)
    );

    if (existingIndex === -1) {
      result.push(item);
    } else {
      // Merge properties so we retain resolved MovieLens ID, poster, genres, etc.
      result[existingIndex] = {
        ...result[existingIndex],
        ...item,
        movieLensId: item.movieLensId ?? result[existingIndex].movieLensId ?? null,
        ml_id: item.ml_id ?? result[existingIndex].ml_id ?? undefined,
        imdbId: item.imdbId ?? result[existingIndex].imdbId ?? null,
        tmdbId: item.tmdbId ?? result[existingIndex].tmdbId ?? null,
        genres: item.genres || result[existingIndex].genres,
        poster_path: item.poster_path || result[existingIndex].poster_path,
        posterUrl: item.posterUrl || result[existingIndex].posterUrl,
        rating: item.rating ?? result[existingIndex].rating,
      };
    }
  }

  return result;
}
