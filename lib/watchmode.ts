const WATCHMODE_API_KEY = process.env.WATCHMODE_API_KEY;
const BASE_URL = 'https://api.watchmode.com/v1';

export interface WatchmodeResponse {
  results: any[];
}

// Global Image Helper
export const getWatchmodeImageUrl = (
  path: string | null | undefined,
  size: string = "w500"
) => {
  if (!path || path === "null") return "/placeholder-poster.jpg";
  return path;
};

// ============================================================
// SERVER-SIDE IN-MEMORY CACHE & REQUEST DEDUPLICATION
// ============================================================

interface CacheEntry {
  data: any;
  timestamp: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const apiCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<any>>();

function getFromCache(key: string): any | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    apiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key: string, data: any): void {
  if (data !== null && data !== undefined) {
    // Keep cache size bounded (max 1000 entries)
    if (apiCache.size > 1000) {
      const oldestKey = apiCache.keys().next().value;
      if (oldestKey) apiCache.delete(oldestKey);
    }
    apiCache.set(key, { data, timestamp: Date.now() });
  }
}

// ============================================================
// SAFE FETCH WITH BOUNDED EXPONENTIAL BACKOFF & 429 HANDLING
// ============================================================

async function fetchFromWatchmode(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<any> {
  if (!WATCHMODE_API_KEY) {
    console.warn("[Watchmode] WATCHMODE_API_KEY is not set in environment variables");
    return null;
  }

  const queryParams = new URLSearchParams({
    apiKey: WATCHMODE_API_KEY,
    ...params,
  });

  const cacheKey = `${endpoint}?${queryParams.toString()}`;

  // 1. Check in-memory cache
  const cachedData = getFromCache(cacheKey);
  if (cachedData !== null) {
    return cachedData;
  }

  // 2. Request deduplication for concurrent calls
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    const url = `${BASE_URL}${endpoint}?${queryParams.toString()}`;
    const maxAttempts = 2; // Bounded retry: max 1 retry on 429

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (response.status === 429) {
          console.warn(`[Watchmode] 429 Rate Limit hit on attempt ${attempt} for ${endpoint}`);
          if (attempt < maxAttempts) {
            // Bounded delay before 1 retry (500ms)
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          // Return cached data if exists or graceful null
          return cachedData || null;
        }

        if (!response.ok) {
          console.warn(`[Watchmode] API Error HTTP ${response.status}: ${response.statusText} on ${endpoint}`);
          return null;
        }

        const data = await response.json();
        setInCache(cacheKey, data);
        return data;
      } catch (error: any) {
        if (attempt >= maxAttempts) {
          console.warn(`[Watchmode] Request failed for ${endpoint}: ${error?.message || error}`);
          return cachedData || null;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    return cachedData || null;
  })();

  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

// Fallback empty response
const emptyResponse: WatchmodeResponse = { results: [] };

// ============================================================
// TITLE DETAILS
// ============================================================

export async function getMovieDetails(id: string | number): Promise<any> {
  if (!id) return null;
  const data = await fetchFromWatchmode(`/title/${id}/details/`, { append_to_response: 'sources' });
  return data || null;
}

export async function getSeriesDetails(id: string | number): Promise<any> {
  if (!id) return null;
  const data = await fetchFromWatchmode(`/title/${id}/details/`, { append_to_response: 'sources' });
  return data || null;
}

export async function getDetailsByExternalId(tmdbId?: string, imdbId?: string): Promise<any> {
  if (tmdbId) {
    const cleanTmdb = tmdbId.toString().replace(/\.0$/, '');
    const data = await fetchFromWatchmode(`/title/movie-${cleanTmdb}/details/`, { append_to_response: 'sources' });
    if (data && !data.error && data.id) return data;
  }

  if (imdbId) {
    const formattedImdb = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
    const data = await fetchFromWatchmode(`/title/${formattedImdb}/details/`, { append_to_response: 'sources' });
    if (data && !data.error && data.id) return data;
  }

  return null;
}

// ============================================================
// LIST FETCHING WITH RATE-SAFE DETAILS ENRICHMENT
// ============================================================

async function fetchListAndDetails(
  endpoint: string,
  params: Record<string, string> = {},
  limit = 8
): Promise<WatchmodeResponse> {
  const data = await fetchFromWatchmode(endpoint, { ...params, limit: limit.toString() });

  if (!data || !data.titles || !Array.isArray(data.titles)) {
    return emptyResponse;
  }

  const titlesToFetch = data.titles.slice(0, limit);
  const detailedResults: any[] = [];

  // Fetch details with gentle pacing to protect Watchmode rate quotas
  for (const item of titlesToFetch) {
    try {
      const details = await getMovieDetails(item.id);
      if (details && details.id) {
        detailedResults.push(details);
      } else {
        // Graceful fallback to the list item metadata if detail fetch returned null
        detailedResults.push({
          id: item.id,
          title: item.title || item.name || "Unknown",
          name: item.title || item.name || "Unknown",
          year: item.year,
          user_rating: item.user_rating || null,
          critic_score: item.critic_score || null,
          poster: item.poster || item.image_url || null,
          image_url: item.poster || item.image_url || null,
          backdrop: item.backdrop || null,
          plot_overview: item.plot_overview || "",
          type: item.type || (params.types?.includes("tv") ? "series" : "movie"),
        });
      }
    } catch {
      // Fallback to list item
      detailedResults.push(item);
    }
  }

  return {
    results: detailedResults,
  };
}

export async function getTrendingMovies(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'popularity_desc', types: 'movie' }, 10);
}

export async function getPopularMovies(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'popularity_desc', types: 'movie', page: '2' }, 10);
}

export async function getTrendingSeries(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'popularity_desc', types: 'tv_series' }, 10);
}

export async function getPopularSeries(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'popularity_desc', types: 'tv_series', page: '2' }, 10);
}

export async function getTopRatedSeries(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'relevance_desc', types: 'tv_series' }, 10);
}

export async function getTopRatedMovies(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'relevance_desc', types: 'movie' }, 10);
}

// ============================================================
// SEARCH ENDPOINTS (Enriched with ratings & metadata)
// ============================================================

export async function searchMovies(query: string): Promise<WatchmodeResponse> {
  if (!query) return emptyResponse;
  const data = await fetchFromWatchmode('/autocomplete-search/', { search_value: query, search_type: '1' });
  if (!data || !data.results || !Array.isArray(data.results)) return emptyResponse;

  const topResults = data.results.slice(0, 16);
  const enrichedResults = await Promise.all(
    topResults.map(async (item: any) => {
      try {
        const details = await getMovieDetails(item.id);
        if (details && details.id) {
          return {
            ...item,
            ...details,
            title: details.title || item.name || item.title,
            name: details.title || item.name || item.title,
            user_rating: details.user_rating,
            critic_score: details.critic_score,
            genre_names: details.genre_names || item.genre_names,
            plot_overview: details.plot_overview || item.plot_overview,
            poster: details.poster || item.image_url || item.poster,
            image_url: details.poster || item.image_url || item.poster,
            backdrop: details.backdrop || item.backdrop,
            tmdb_id: details.tmdb_id || item.tmdb_id,
            imdb_id: details.imdb_id || item.imdb_id,
          };
        }
      } catch {
        // Fallback to base item
      }
      return item;
    })
  );

  return { results: enrichedResults };
}

export async function searchSeries(query: string): Promise<WatchmodeResponse> {
  if (!query) return emptyResponse;
  const data = await fetchFromWatchmode('/autocomplete-search/', { search_value: query, search_type: '2' });
  if (!data || !data.results || !Array.isArray(data.results)) return emptyResponse;

  const topResults = data.results.slice(0, 16);
  const enrichedResults = await Promise.all(
    topResults.map(async (item: any) => {
      try {
        const details = await getSeriesDetails(item.id);
        if (details && details.id) {
          return {
            ...item,
            ...details,
            title: details.title || item.name || item.title,
            name: details.title || item.name || item.title,
            user_rating: details.user_rating,
            critic_score: details.critic_score,
            genre_names: details.genre_names || item.genre_names,
            plot_overview: details.plot_overview || item.plot_overview,
            poster: details.poster || item.image_url || item.poster,
            image_url: details.poster || item.image_url || item.poster,
            backdrop: details.backdrop || item.backdrop,
            tmdb_id: details.tmdb_id || item.tmdb_id,
            imdb_id: details.imdb_id || item.imdb_id,
          };
        }
      } catch {
        // Fallback to base item
      }
      return item;
    })
  );

  return { results: enrichedResults };
}
