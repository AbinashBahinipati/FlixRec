"use server";

import {
  searchMovies,
  searchSeries,
  getWatchmodeImageUrl,
  getDetailsByExternalId,
  getMovieDetails,
  getSeriesDetails
} from "@/lib/watchmode";
import { MovieCardProps } from "@/components/MovieCard";

interface MLRecommendation {
  movieId: number;
  title: string;
  genres: string;
  score: number;
  tmdbId?: string;
  imdbId?: string;
}

export interface RecommendationRequest {
  liked_movie_ids: number[];
  disliked_movie_ids: number[];
  watched_movie_ids: number[];
  n?: number;
}

export interface UnifiedRecommendationResult {
  success: boolean;
  recommendations: MovieCardProps[];
  isColdStart?: boolean;
  error?: string;
}

export interface ResolveMovieLensInput {
  title: string;
  year?: string | number | null;
  type?: "movie" | "series" | "tv";
  watchmodeId?: string | number | null;
  id?: string | number | null;
  tmdbId?: string | number | null;
  imdbId?: string | null;
  tmdb_id?: string | number | null;
  imdb_id?: string | null;
}

const CANDIDATE_BACKEND_URLS = Array.from(
  new Set(
    [
      (process.env.FASTAPI_URL || "").replace(/\/+$/, ""),
      "http://127.0.0.1:8000",
      "http://localhost:8000",
      (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, ""),
      "https://flixrec.onrender.com",
    ].filter(Boolean)
  )
);

export async function fetchFromFastApi(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  let lastError: any = null;
  let lastResponse: Response | null = null;

  for (const baseUrl of CANDIDATE_BACKEND_URLS) {
    try {
      const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
      const res = await fetch(url, {
        ...options,
        signal: options.signal || AbortSignal.timeout(10000),
        cache: "no-store",
      });

      if (res.ok) {
        return res;
      }

      lastResponse = res;
      console.warn(`[FastAPI Request] ${url} returned HTTP ${res.status}`);
      // If 429 (rate limited) or 5xx (cold start/server error), try local/fallback backend
      if (res.status === 429 || res.status >= 500) {
        continue;
      }
      return res;
    } catch (err: any) {
      lastError = err;
      console.warn(`[FastAPI Request] Failed to reach ${baseUrl}:`, err?.message || err);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error("Failed to connect to recommendation backend");
}

export async function checkBackendHealth(): Promise<{ online: boolean; isColdStart: boolean }> {
  try {
    const res = await fetchFromFastApi("/health", {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      return { online: true, isColdStart: false };
    }
    return { online: false, isColdStart: true };
  } catch {
    return { online: false, isColdStart: true };
  }
}

export async function fetchMovieLensId(
  inputOrTitle: ResolveMovieLensInput | string,
  legacyYear?: string | number,
  legacyType: "movie" | "series" | "tv" = "movie",
  legacyTmdbId?: string | number | null,
  legacyImdbId?: string | null,
  legacyWatchmodeId?: string | number | null
): Promise<{
  resolved: boolean;
  ml_id: number | null;
  imdbId?: string | null;
  tmdbId?: string | null;
  title?: string;
  debug?: any;
}> {
  try {
    let title: string;
    let year: string | number | undefined;
    let type: "movie" | "series" | "tv" = "movie";
    let tmdbId: string | number | undefined;
    let imdbId: string | undefined;
    let watchmodeId: string | number | undefined;

    if (typeof inputOrTitle === "object" && inputOrTitle !== null) {
      title = inputOrTitle.title;
      year = inputOrTitle.year ?? undefined;
      type = inputOrTitle.type || "movie";
      tmdbId = inputOrTitle.tmdbId ?? inputOrTitle.tmdb_id ?? undefined;
      imdbId = (inputOrTitle.imdbId ?? inputOrTitle.imdb_id) || undefined;
      watchmodeId = inputOrTitle.watchmodeId ?? inputOrTitle.id ?? undefined;
    } else {
      title = inputOrTitle;
      year = legacyYear;
      type = legacyType;
      tmdbId = legacyTmdbId ?? undefined;
      imdbId = legacyImdbId || undefined;
      watchmodeId = legacyWatchmodeId ?? undefined;
    }

    if (type === "series" || type === "tv") {
      return {
        resolved: false,
        ml_id: null,
        imdbId: imdbId || null,
        tmdbId: tmdbId ? String(tmdbId) : null,
      };
    }

    // If external IDs are missing, perform ONE server-side Watchmode lookup using watchmodeId
    if ((!imdbId || !tmdbId) && watchmodeId) {
      try {
        const details = await getMovieDetails(watchmodeId);
        if (details) {
          if (!imdbId && details.imdb_id) imdbId = details.imdb_id;
          if (!tmdbId && details.tmdb_id) tmdbId = details.tmdb_id;
          if (!year && details.year) year = details.year;
        }
      } catch (err) {
        console.warn(`[fetchMovieLensId] Server-side Watchmode lookup failed for ID ${watchmodeId}:`, err);
      }
    }

    let yearNum: number | undefined;
    if (typeof year === "number") {
      yearNum = year;
    } else if (year) {
      const yearMatch = String(year).match(/\d{4}/);
      if (yearMatch) yearNum = parseInt(yearMatch[0], 10);
    }

    const res = await fetchFromFastApi("/resolve-external", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        year: yearNum,
        type,
        tmdbId: tmdbId ? String(tmdbId) : undefined,
        imdbId: imdbId ? String(imdbId) : undefined,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return { resolved: false, ml_id: null };
    const data = await res.json();

    return {
      resolved: !!data.found,
      ml_id: data.movieLensId || null,
      imdbId: data.imdbId || imdbId || null,
      tmdbId: data.tmdbId || (tmdbId ? String(tmdbId) : null),
      title: data.title || title,
      debug: data.debug,
    };
  } catch (err) {
    console.warn("Error resolving MovieLens ID (non-fatal):", err);
    return { resolved: false, ml_id: null };
  }
}

/**
 * Parses MovieLens title format "Movie Name (YYYY)" into { title, year }
 */
function parseMovieLensTitle(rawTitle: string) {
  const match = rawTitle.match(/^(.*?)\s*\((\d{4})\)$/);
  if (match) {
    return { title: match[1].trim(), year: parseInt(match[2], 10) };
  }
  return { title: rawTitle.trim(), year: undefined };
}

async function enrichSingleRecommendation(rec: any): Promise<MovieCardProps | null> {
  try {
    let match = null;

    if (rec.tmdbId || rec.imdbId) {
      const details = await getDetailsByExternalId(rec.tmdbId, rec.imdbId);
      if (details && details.id) {
        match = details;
      }
    }

    if (!match && rec.title) {
      const { title, year } = parseMovieLensTitle(rec.title);
      const searchRes = await searchMovies(title);
      if (searchRes && searchRes.results && searchRes.results.length > 0) {
        match = searchRes.results[0];
        if (year) {
          const exactMatch = searchRes.results.find((r: any) => r.year === year);
          if (exactMatch) match = exactMatch;
        }
      }
    }

    if (match) {
      if (match.user_rating === undefined && match.id) {
        try {
          const fullDetails =
            match.type === "tv_series"
              ? await getSeriesDetails(match.id)
              : await getMovieDetails(match.id);
          if (fullDetails && fullDetails.id) {
            match = { ...match, ...fullDetails };
          }
        } catch {
          // Ignore detail enrichment failure
        }
      }

      const publicRating =
        typeof match.user_rating === "number" && match.user_rating > 0
          ? match.user_rating
          : typeof match.critic_score === "number" && match.critic_score > 0
          ? match.critic_score / 10
          : null;

      return {
        id: match.id,
        watchmodeId: match.id,
        title: match.name || match.title || rec.title,
        poster_path: getWatchmodeImageUrl(match.image_url || match.poster),
        poster: getWatchmodeImageUrl(match.image_url || match.poster),
        posterUrl: getWatchmodeImageUrl(match.image_url || match.poster),
        rating: publicRating,
        vote_average: publicRating !== null ? publicRating : undefined,
        release_date: match.year ? match.year.toString() : match.release_date || "",
        type: match.type === "tv_series" ? ("series" as const) : ("movie" as const),
        score: rec.score,
        genres: match.genre_names ? match.genre_names.join(", ") : rec.genres || "",
        tmdbId: rec.tmdbId,
        imdbId: rec.imdbId,
        tmdb_id: rec.tmdbId,
        imdb_id: rec.imdbId,
        movieLensId: rec.movieLensId || rec.movieId,
        ml_id: rec.movieLensId || rec.movieId,
        source: rec.source || "hybrid",
      };
    }

    // Graceful fallback when Watchmode API is rate limited or item is not on Watchmode
    const parsed = parseMovieLensTitle(rec.title || "Movie");
    return {
      id: rec.movieId || rec.movieLensId || Math.floor(Math.random() * 1000000),
      watchmodeId: rec.movieId || rec.movieLensId,
      title: parsed.title || rec.title || "Movie",
      poster_path: "/placeholder-poster.jpg",
      poster: "/placeholder-poster.jpg",
      posterUrl: "/placeholder-poster.jpg",
      rating: undefined,
      vote_average: undefined,
      release_date: parsed.year ? String(parsed.year) : "",
      type: "movie" as const,
      score: rec.score,
      genres: Array.isArray(rec.genres) ? rec.genres.join(", ") : rec.genres || "",
      tmdbId: rec.tmdbId,
      imdbId: rec.imdbId,
      tmdb_id: rec.tmdbId,
      imdb_id: rec.imdbId,
      movieLensId: rec.movieLensId || rec.movieId,
      ml_id: rec.movieLensId || rec.movieId,
      source: rec.source || "hybrid",
    };
  } catch (err) {
    console.warn("Failed to enrich recommendation item:", err);
    return null;
  }
}

export async function getUnifiedRecommendations(payload: {
  liked_media: any[];
  disliked_media: any[];
  watched_media: any[];
  n?: number;
}): Promise<UnifiedRecommendationResult> {
  try {
    const targetN = payload.n || 10;

    // Dynamic pre-resolution: guarantee that all liked movies have their MovieLens IDs resolved
    const resolvedLikedMedia = await Promise.all(
      (payload.liked_media || []).map(async (item: any) => {
        const copy = { ...item };
        const isSeries = copy.type === "series" || copy.type === "tv";
        if (!isSeries && !copy.movieLensId && !copy.ml_id) {
          const res = await fetchMovieLensId(copy);
          if (res.resolved && res.ml_id) {
            copy.movieLensId = res.ml_id;
            copy.ml_id = res.ml_id;
            copy.resolved = true;
            copy.resolvableByML = true;
            if (res.imdbId) copy.imdbId = res.imdbId;
            if (res.tmdbId) copy.tmdbId = res.tmdbId;
          }
        }
        return copy;
      })
    );

    const liked_movie_ids = resolvedLikedMedia
      .map((m) => m.movieLensId ?? m.ml_id)
      .filter((id): id is number => typeof id === "number" && !isNaN(id));

    const disliked_movie_ids = (payload.disliked_media || [])
      .map((m: any) => m.movieLensId ?? m.ml_id)
      .filter((id): id is number => typeof id === "number" && !isNaN(id));

    const watched_movie_ids = (payload.watched_media || [])
      .map((m: any) => m.movieLensId ?? m.ml_id)
      .filter((id): id is number => typeof id === "number" && !isNaN(id));

    const unresolved_likes = resolvedLikedMedia
      .filter((m) => !m.movieLensId && !m.ml_id)
      .map((m) => ({
        title: m.title,
        type: m.type || "movie",
        genres: m.genres,
      }));

    console.log(
      `[RECOMMEND] Dynamic ID Resolution: ${liked_movie_ids.length} MovieLens IDs resolved from ${resolvedLikedMedia.length} total liked items.`
    );

    const res = await fetchFromFastApi("/recommend/unified", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liked_movie_ids,
        disliked_movie_ids,
        watched_movie_ids,
        liked_media: resolvedLikedMedia,
        disliked_media: payload.disliked_media || [],
        watched_media: payload.watched_media || [],
        unresolved_likes,
        n: Math.max(targetN * 2, 20),
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!res.ok) {
      console.warn(`[Recommendations Action] Backend returned HTTP ${res.status}: ${res.statusText}`);
      const isCold = res.status === 502 || res.status === 503 || res.status === 504 || res.status === 500;
      return {
        success: false,
        isColdStart: isCold,
        recommendations: [],
        error: isCold
          ? "Recommendation engine is starting..."
          : `Recommendation service error (HTTP ${res.status})`,
      };
    }

    const data = await res.json();
    if (!data.success || !Array.isArray(data.recommendations)) {
      return {
        success: false,
        isColdStart: false,
        recommendations: [],
        error: data.error || "The recommendation engine is temporarily unavailable.",
      };
    }

    if (data.recommendations.length === 0) {
      return {
        success: true,
        recommendations: [],
      };
    }

    console.log(`[RECOMMEND] Watchmode enrichment started: count=${data.recommendations.length}`);

    // Parallel enrichment with error boundaries
    const enrichedList = await Promise.all(
      data.recommendations.map((rec: any) => enrichSingleRecommendation(rec))
    );

    const validRecommendations = enrichedList
      .filter((item): item is MovieCardProps => item !== null)
      .slice(0, targetN);

    console.log(`[RECOMMEND] Watchmode enrichment finished: success=${validRecommendations.length}`);

    return {
      success: true,
      recommendations: validRecommendations,
    };
  } catch (error: any) {
    console.warn("[Recommendations Action] Network/timeout contacting backend:", error?.message || error);
    return {
      success: false,
      isColdStart: true,
      recommendations: [],
      error: "Recommendation engine is starting...",
    };
  }
}

