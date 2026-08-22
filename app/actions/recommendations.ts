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

const FASTAPI_URL = (
  process.env.FASTAPI_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export async function checkBackendHealth(): Promise<{ online: boolean; isColdStart: boolean }> {
  try {
    const res = await fetch(`${FASTAPI_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
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
  title: string,
  year?: string | number,
  type: "movie" | "series" | "tv" = "movie",
  tmdbId?: string | number | null,
  imdbId?: string | null
): Promise<{ resolved: boolean; ml_id: number | null; imdbId?: string | null; tmdbId?: string | null }> {
  try {
    const url = `${FASTAPI_URL}/resolve-external`;

    let yearNum: number | undefined;
    if (typeof year === "number") {
      yearNum = year;
    } else if (year) {
      const yearMatch = year.match(/\d{4}/);
      if (yearMatch) yearNum = parseInt(yearMatch[0], 10);
    }

    const res = await fetch(url, {
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
      cache: "no-store",
    });

    if (!res.ok) return { resolved: false, ml_id: null };
    const data = await res.json();

    return {
      resolved: !!data.found,
      ml_id: data.movieLensId || null,
      imdbId: data.imdbId || null,
      tmdbId: data.tmdbId || null,
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

    if (!match) {
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
  } catch (err) {
    console.warn("Failed to enrich recommendation item:", err);
  }
  return null;
}

export async function getUnifiedRecommendations(payload: {
  liked_media: any[];
  disliked_media: any[];
  watched_media: any[];
  n?: number;
}): Promise<UnifiedRecommendationResult> {
  try {
    const res = await fetch(`${FASTAPI_URL}/recommend/unified`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liked_media: payload.liked_media,
        disliked_media: payload.disliked_media,
        watched_media: payload.watched_media,
        n: payload.n || 10,
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
      cache: "no-store",
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

    const validRecommendations = enrichedList.filter(
      (item): item is MovieCardProps => item !== null
    );

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
