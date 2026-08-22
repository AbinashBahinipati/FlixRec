import { getPopularSeries, getTopRatedSeries, getTrendingSeries, getWatchmodeImageUrl } from "@/lib/watchmode";
import ContentRow from "@/components/ContentRow";

export default async function SeriesPage() {
  const [popularSeries, topRatedSeries, trendingSeries] = await Promise.all([
    getPopularSeries(),
    getTopRatedSeries(),
    getTrendingSeries(),
  ]);

  const mapToCard = (item: any) => {
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
      release_date: item.year ? item.year.toString() : item.release_date || item.first_air_date || "",
      type: "series" as const,
      genres: item.genre_names ? item.genre_names.join(", ") : "",
      overview: item.plot_overview || "",
      tmdbId: item.tmdb_id?.toString() || item.tmdbId?.toString(),
      imdbId: item.imdb_id?.toString() || item.imdbId?.toString(),
      tmdb_id: item.tmdb_id?.toString() || item.tmdbId?.toString(),
      imdb_id: item.imdb_id?.toString() || item.imdbId?.toString(),
    };
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white pt-24 px-4 sm:px-6 lg:px-8 pb-20">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Web Series</h1>
        
        <div className="space-y-8">
          <ContentRow title="Trending Web Series" items={trendingSeries.results.map(mapToCard)} />
          <ContentRow title="Popular Web Series" items={popularSeries.results.map(mapToCard)} />
          <ContentRow title="Top Rated Web Series" items={topRatedSeries.results.map(mapToCard)} />
        </div>
      </div>
    </div>
  );
}
