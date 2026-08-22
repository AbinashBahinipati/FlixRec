"use server";

import { searchMovies, searchSeries, getWatchmodeImageUrl, getDetailsByExternalId, getMovieDetails, getSeriesDetails } from "@/lib/watchmode";

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

const FASTAPI_URL = process.env.FASTAPI_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

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
        imdbId: imdbId ? String(imdbId) : undefined 
      }),
      cache: "no-store" 
    });
    
    if (!res.ok) return { resolved: false, ml_id: null };
    const data = await res.json();
    
    return {
      resolved: !!data.found,
      ml_id: data.movieLensId || null,
      imdbId: data.imdbId || null,
      tmdbId: data.tmdbId || null
    };
  } catch (err) {
    console.error("Error fetching MovieLens ID:", err);
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

export async function getMappedRecommendations(prefs: RecommendationRequest) {
  try {
    // 1. Fetch ML Recommendations
    const mlResponse = await fetch(`${FASTAPI_URL}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liked_movie_ids: prefs.liked_movie_ids,
        disliked_movie_ids: prefs.disliked_movie_ids,
        watched_movie_ids: prefs.watched_movie_ids,
        n: prefs.n || 10
      }),
      // Use no-store so recommendations stay fresh based on user state
      cache: "no-store", 
    });

    if (!mlResponse.ok) {
      throw new Error("FastAPI ML backend is unavailable.");
    }

    const mlData = await mlResponse.json();
    if (!mlData.success || !mlData.recommendations) {
      throw new Error("Invalid response from ML backend.");
    }

    const mlRecommendations: MLRecommendation[] = mlData.recommendations;
    const finalRecommendations = [];

    // 2. Map MovieLens IDs -> Watchmode via External ID or Title Search
    for (const rec of mlRecommendations) {
      let match = null;

      // Prefer External ID lookup
      if (rec.tmdbId || rec.imdbId) {
        const details = await getDetailsByExternalId(rec.tmdbId, rec.imdbId);
        if (details && details.id) {
          match = details;
        }
      }

      // Fallback to title search if external ID failed or wasn't provided
      if (!match) {
        const { title, year } = parseMovieLensTitle(rec.title);
        const searchRes = await searchMovies(title);
        
        if (searchRes && searchRes.results && searchRes.results.length > 0) {
          match = searchRes.results[0];
          if (year) {
            const exactMatch = searchRes.results.find((r: any) => r.year === year);
            if (exactMatch) {
              match = exactMatch;
            }
          }
        }
      }
      
      if (match) {
        if (match.user_rating === undefined && match.id) {
          try {
            const fullDetails = match.type === "tv_series" ? await getSeriesDetails(match.id) : await getMovieDetails(match.id);
            if (fullDetails && fullDetails.id) {
              match = { ...match, ...fullDetails };
            }
          } catch (e) {
            // Ignore detail fetch errors
          }
        }

        const publicRating = (typeof match.user_rating === "number" && match.user_rating > 0)
          ? match.user_rating
          : (typeof match.critic_score === "number" && match.critic_score > 0)
            ? match.critic_score / 10
            : null;

        finalRecommendations.push({
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
          genres: match.genre_names ? match.genre_names.join(", ") : "",
          tmdb_id: rec.tmdbId,
          imdb_id: rec.imdbId,
          tmdbId: rec.tmdbId,
          imdbId: rec.imdbId,
          movieLensId: rec.movieId,
          ml_id: rec.movieId
        });
      }
      
      // Optional: tiny delay to protect Watchmode Rate Limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return finalRecommendations;

  } catch (error) {
    console.error("Error in getMappedRecommendations:", error);
    throw error;
  }
}

export async function getUnifiedRecommendations(payload: {
  liked_media: any[];
  disliked_media: any[];
  watched_media: any[];
  n?: number;
}) {
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
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Unified recommendation API error: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.success || !data.recommendations) {
      throw new Error("Invalid response from Unified ML backend.");
    }

    const recommendations = [];
    for (const rec of data.recommendations) {
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
            const fullDetails = match.type === "tv_series" ? await getSeriesDetails(match.id) : await getMovieDetails(match.id);
            if (fullDetails && fullDetails.id) {
              match = { ...match, ...fullDetails };
            }
          } catch (e) {
            // Ignore detail fetch errors
          }
        }

        const publicRating = (typeof match.user_rating === "number" && match.user_rating > 0)
          ? match.user_rating
          : (typeof match.critic_score === "number" && match.critic_score > 0)
            ? match.critic_score / 10
            : null;

        recommendations.push({
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
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    return recommendations;
  } catch (error) {
    console.error("Error in getUnifiedRecommendations:", error);
    // Fallback to standard recommendation flow
    const liked_movie_ids = payload.liked_media
      .filter((m) => m.movieLensId || m.ml_id)
      .map((m) => Number(m.movieLensId || m.ml_id));
    const disliked_movie_ids = payload.disliked_media
      .filter((m) => m.movieLensId || m.ml_id)
      .map((m) => Number(m.movieLensId || m.ml_id));
    const watched_movie_ids = payload.watched_media
      .filter((m) => m.movieLensId || m.ml_id)
      .map((m) => Number(m.movieLensId || m.ml_id));

    return getMappedRecommendations({
      liked_movie_ids,
      disliked_movie_ids,
      watched_movie_ids,
      n: payload.n || 10,
    });
  }
}
