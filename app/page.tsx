import HeroBanner from "@/components/HeroBanner";
import ContentRow from "@/components/ContentRow";
import {
  getTrendingMovies,
  getPopularMovies,
  getTrendingSeries,
  getTopRatedMovies,
  getWatchmodeImageUrl,
} from "@/lib/watchmode";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [trendingMovies, popularMovies, trendingSeries, topRatedMovies] = await Promise.all([
    getTrendingMovies(),
    getPopularMovies(),
    getTrendingSeries(),
    getTopRatedMovies(),
  ]);

  // Using the first trending movie as the hero banner
  const heroMovie = trendingMovies.results[0];
  const heroData = heroMovie ? {
    id: heroMovie.id,
    watchmodeId: heroMovie.id,
    title: heroMovie.title || heroMovie.name || "Unknown Title",
    plot_overview: heroMovie.plot_overview || "",
    backdrop: getWatchmodeImageUrl(heroMovie.backdrop, "original"),
    poster: getWatchmodeImageUrl(heroMovie.poster || heroMovie.image_url),
    poster_path: getWatchmodeImageUrl(heroMovie.poster || heroMovie.image_url),
    posterUrl: getWatchmodeImageUrl(heroMovie.poster || heroMovie.image_url),
    release_date: heroMovie.release_date || (heroMovie.year ? heroMovie.year.toString() : ""),
    year: heroMovie.year || (heroMovie.release_date ? parseInt(heroMovie.release_date) : undefined),
    user_rating: heroMovie.user_rating || null,
    rating: heroMovie.user_rating || null,
    genre: heroMovie.genre_names ? heroMovie.genre_names.join(" • ") : "Action • Sci-Fi",
    genres: heroMovie.genre_names ? heroMovie.genre_names.join(", ") : "",
    trailer: heroMovie.trailer || null,
    type: "movie" as const,
    tmdbId: heroMovie.tmdb_id?.toString() || heroMovie.tmdbId?.toString(),
    imdbId: heroMovie.imdb_id?.toString() || heroMovie.imdbId?.toString(),
  } : null;

  if (!heroMovie) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-3xl font-bold text-white mb-4">No movies found</h1>
        <p className="text-gray-400 max-w-md">
          We couldn't connect to the Watchmode API. Please check your network connection, your API key, or disable your VPN/ad-blocker if it is blocking api.watchmode.com.
        </p>
      </div>
    );
  }

  const mapToCard = (item: any, type: "movie" | "series" = "movie") => {
    const publicRating = (typeof item.user_rating === "number" && item.user_rating > 0)
      ? item.user_rating
      : (typeof item.critic_score === "number" && item.critic_score > 0)
        ? item.critic_score / 10
        : null;

    return {
      id: item.id,
      watchmodeId: item.id,
      title: item.title || item.name || "Unknown",
      poster_path: getWatchmodeImageUrl(item.poster || item.image_url),
      poster: getWatchmodeImageUrl(item.poster || item.image_url),
      posterUrl: getWatchmodeImageUrl(item.poster || item.image_url),
      backdropUrl: item.backdrop ? getWatchmodeImageUrl(item.backdrop, "original") : undefined,
      vote_average: publicRating !== null ? publicRating : undefined,
      rating: publicRating,
      year: item.year || (item.release_date ? parseInt(item.release_date) : undefined),
      release_date: item.year ? item.year.toString() : item.release_date || "",
      type,
      genres: item.genre_names ? item.genre_names.join(", ") : "",
      overview: item.plot_overview || "",
      tmdbId: item.tmdb_id?.toString() || item.tmdbId?.toString(),
      imdbId: item.imdb_id?.toString() || item.imdbId?.toString(),
      tmdb_id: item.tmdb_id?.toString() || item.tmdbId?.toString(),
      imdb_id: item.imdb_id?.toString() || item.imdbId?.toString(),
    };
  };

  return (
    <div className="min-h-screen bg-[#050505]">
      {heroData && <HeroBanner movie={heroData} />}
      
      <div className="pb-20 -mt-20 sm:-mt-32 relative z-20">
        <ContentRow 
          title="Trending Movies" 
          items={trendingMovies.results.slice(1).map(m => mapToCard(m, "movie"))} 
        />
        
        <ContentRow 
          title="Popular Movies" 
          items={popularMovies.results.map(m => mapToCard(m, "movie"))} 
        />
        
        <ContentRow 
          title="Trending Web Series" 
          items={trendingSeries.results.map(s => mapToCard(s, "series"))} 
        />
        
        <ContentRow 
          title="Top Rated Movies" 
          items={topRatedMovies.results.map(m => mapToCard(m, "movie"))} 
        />
      </div>
    </div>
  );
}
