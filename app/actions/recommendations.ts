"use server";

import {
  searchMovies,
  searchSeries,
  getTrendingMovies,
  getPopularMovies,
  getTrendingSeries,
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

async function generateContentFallbackRecommendations(
  payload: {
    liked_media: any[];
    disliked_media: any[];
    watched_media: any[];
  },
  targetN: number = 10
): Promise<MovieCardProps[]> {
  try {
    const excludedIds = new Set<string>();
    const excludedTitles = new Set<string>();
    const likedGenres = new Set<string>();

    const allExcluded = [
      ...(payload.liked_media || []),
      ...(payload.disliked_media || []),
      ...(payload.watched_media || []),
    ];

    for (const item of allExcluded) {
      if (item.id) excludedIds.add(String(item.id));
      if (item.watchmodeId) excludedIds.add(String(item.watchmodeId));
      if (item.title) excludedTitles.add(item.title.toLowerCase().trim());
    }

    for (const item of payload.liked_media || []) {
      const g = item.genres;
      if (Array.isArray(g)) {
        g.forEach((genre) => likedGenres.add(String(genre).toLowerCase().trim()));
      } else if (typeof g === "string") {
        g.split(/[,|]/).forEach((genre) => likedGenres.add(genre.toLowerCase().trim()));
      }
    }

    const [trendingMovies, popularMovies, trendingSeries] = await Promise.allSettled([
      getTrendingMovies(),
      getPopularMovies(),
      getTrendingSeries(),
    ]);

    const candidates: any[] = [];
    const addResults = (settled: PromiseSettledResult<any>) => {
      if (settled.status === "fulfilled" && settled.value?.results) {
        candidates.push(...settled.value.results);
      }
    };

    addResults(trendingMovies);
    addResults(popularMovies);
    addResults(trendingSeries);

    const scored = candidates
      .filter((c) => {
        if (!c || (!c.id && !c.title && !c.name)) return false;
        const cid = String(c.id);
        const ctitle = (c.title || c.name || "").toLowerCase().trim();
        if (excludedIds.has(cid) || excludedTitles.has(ctitle)) return false;
        return true;
      })
      .map((c) => {
        const cGenres = Array.isArray(c.genre_names)
          ? c.genre_names.map((g: string) => g.toLowerCase().trim())
          : typeof c.genres === "string"
          ? c.genres.split(/[,|]/).map((g: string) => g.toLowerCase().trim())
          : [];

        let overlap = 0;
        for (const g of cGenres) {
          if (likedGenres.has(g)) overlap++;
        }

        const score = 0.5 + 0.15 * overlap;
        const publicRating =
          typeof c.user_rating === "number" && c.user_rating > 0
            ? c.user_rating
            : typeof c.critic_score === "number" && c.critic_score > 0
            ? c.critic_score / 10
            : undefined;

        return {
          id: c.id,
          watchmodeId: c.id,
          title: c.title || c.name || "Recommendation",
          poster_path: getWatchmodeImageUrl(c.poster || c.image_url),
          poster: getWatchmodeImageUrl(c.poster || c.image_url),
          posterUrl: getWatchmodeImageUrl(c.poster || c.image_url),
          rating: publicRating,
          vote_average: publicRating,
          release_date: c.year ? String(c.year) : c.release_date || "",
          type: c.type === "tv_series" || c.type === "series" ? ("series" as const) : ("movie" as const),
          score: Math.min(1.0, score),
          genres: Array.isArray(c.genre_names) ? c.genre_names.join(", ") : c.genres || "",
          tmdbId: c.tmdb_id ? String(c.tmdb_id) : undefined,
          imdbId: c.imdb_id ? String(c.imdb_id) : undefined,
          source: "content" as const,
        };
      });

    scored.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Deduplicate by ID
    const seen = new Set<string>();
    const uniqueList: MovieCardProps[] = [];
    for (const item of scored) {
      const key = String(item.id || item.title);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueList.push(item);
      }
      if (uniqueList.length >= targetN) break;
    }

    return uniqueList;
  } catch (err) {
    console.warn("[generateContentFallbackRecommendations] Fallback generation error:", err);
    return [];
  }
}

export async function getUnifiedRecommendations(payload: {
  liked_media: any[];
  disliked_media: any[];
  watched_media: any[];
  n?: number;
}): Promise<UnifiedRecommendationResult> {
  const targetN = payload.n || 10;

  try {
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

    let res: Response | null = null;
    try {
      res = await fetchFromFastApi("/recommend/unified", {
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
        signal: AbortSignal.timeout(8000), // 8s timeout for cloud responsiveness
      });
    } catch (backendErr: any) {
      console.warn("[RECOMMEND] FastAPI unreachable. Engaging cloud fallback generator:", backendErr?.message || backendErr);
    }

    if (res && res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        const enrichedList = await Promise.all(
          data.recommendations.map((rec: any) => enrichSingleRecommendation(rec))
        );

        const validRecommendations = enrichedList
          .filter((item): item is MovieCardProps => item !== null)
          .slice(0, targetN);

        if (validRecommendations.length > 0) {
          return {
            success: true,
            recommendations: validRecommendations,
          };
        }
      }
    }

    // Graceful cloud fallback: Guarantee recommendations are never empty or broken on Vercel
    console.log("[RECOMMEND] Serving resilient content recommendations fallback.");
    const fallbackRecs = await generateContentFallbackRecommendations(
      {
        liked_media: resolvedLikedMedia,
        disliked_media: payload.disliked_media,
        watched_media: payload.watched_media,
      },
      targetN
    );

    return {
      success: true,
      recommendations: fallbackRecs,
    };
  } catch (error: any) {
    console.warn("[Recommendations Action] Unexpected error, generating fallback:", error?.message || error);
    const fallbackRecs = await generateContentFallbackRecommendations(payload, targetN);
    return {
      success: true,
      recommendations: fallbackRecs,
    };
  }
}

