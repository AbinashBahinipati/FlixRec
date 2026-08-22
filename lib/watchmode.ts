const WATCHMODE_API_KEY = process.env.WATCHMODE_API_KEY;
const BASE_URL = 'https://api.watchmode.com/v1';

export interface WatchmodeResponse {
  results: any[];
}

// Global Image Helper
export const getWatchmodeImageUrl = (
  path: string | null | undefined,
  size: string = "w500" // Kept for API signature compatibility, though Watchmode URLs are usually absolute
) => {
  if (!path || path === "null") return "/placeholder-poster.jpg";
  return path;
};

async function fetchFromWatchmode(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  if (!WATCHMODE_API_KEY) {
    console.warn("WATCHMODE_API_KEY is not set in environment variables");
    return null;
  }

  const queryParams = new URLSearchParams({
    apiKey: WATCHMODE_API_KEY,
    ...params,
  });

  try {
    const response = await fetch(`${BASE_URL}${endpoint}?${queryParams.toString()}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      console.warn(`Watchmode API Error: ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn("Network error or timeout fetching from Watchmode.");
    return null;
  }
}

// Fallback empty response
const emptyResponse: WatchmodeResponse = { results: [] };

export async function getMovieDetails(id: string | number): Promise<any> {
  const data = await fetchFromWatchmode(`/title/${id}/details/`, { append_to_response: 'sources' });
  return data || null;
}

export async function getSeriesDetails(id: string | number): Promise<any> {
  const data = await fetchFromWatchmode(`/title/${id}/details/`, { append_to_response: 'sources' });
  return data || null;
}

export async function getDetailsByExternalId(tmdbId?: string, imdbId?: string): Promise<any> {
  if (tmdbId) {
    // Attempt tmdb id lookup
    const data = await fetchFromWatchmode(`/title/movie-${tmdbId}/details/`, { append_to_response: 'sources' });
    if (data && !data.error) return data;
  }
  
  if (imdbId) {
    // Attempt imdb id lookup. Usually prefixed with 'tt' if it doesn't have it
    const formattedImdb = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
    const data = await fetchFromWatchmode(`/title/${formattedImdb}/details/`, { append_to_response: 'sources' });
    if (data && !data.error) return data;
  }
  
  return null;
}

async function fetchListAndDetails(endpoint: string, params: Record<string, string> = {}, limit = 6): Promise<WatchmodeResponse> {
  const data = await fetchFromWatchmode(endpoint, { ...params, limit: limit.toString() });
  
  if (!data || !data.titles) return emptyResponse;

  // We must fetch details for each item. To avoid 429 Too Many Requests, we batch them or do them sequentially.
  const titlesToFetch = data.titles.slice(0, limit);
  const detailedResults = [];
  
  for (const title of titlesToFetch) {
    const details = await getMovieDetails(title.id);
    if (details) detailedResults.push(details);
    // Tiny delay to respect rate limits (Watchmode allows ~5-10/sec)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    results: detailedResults
  };
}

export async function getTrendingMovies(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'popularity_desc', types: 'movie' }, 10);
}

export async function getPopularMovies(): Promise<WatchmodeResponse> {
  // Using page 2 to differentiate from trending
  return fetchListAndDetails('/list-titles/', { sort_by: 'popularity_desc', types: 'movie', page: '2' }, 10);
}

export function getTrendingSeries(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'popularity_desc', types: 'tv_series' }, 10);
}

export function getPopularSeries(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'popularity_desc', types: 'tv_series', page: '2' }, 10);
}

export function getTopRatedSeries(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'relevance_desc', types: 'tv_series' }, 10);
}

export async function getTopRatedMovies(): Promise<WatchmodeResponse> {
  return fetchListAndDetails('/list-titles/', { sort_by: 'relevance_desc', types: 'movie' }, 10);
}

// Search Endpoints (Enriched with ratings and details)
export async function searchMovies(query: string): Promise<WatchmodeResponse> {
  if (!query) return emptyResponse;
  const data = await fetchFromWatchmode('/autocomplete-search/', { search_value: query, search_type: '1' });
  if (!data || !data.results) return emptyResponse;

  const topResults = data.results.slice(0, 18);
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
      } catch (e) {
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
  if (!data || !data.results) return emptyResponse;

  const topResults = data.results.slice(0, 18);
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
      } catch (e) {
        // Fallback to base item
      }
      return item;
    })
  );

  return { results: enrichedResults };
}
