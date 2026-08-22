import { searchMovies, searchSeries, getWatchmodeImageUrl } from "@/lib/watchmode";
import MovieCard from "@/components/MovieCard";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q = "", type = "movies" } = await searchParams;

  const results = q
    ? await (type === "series" ? searchSeries(q) : searchMovies(q))
    : null;

  return (
    <div className="min-h-screen bg-[#050505] pt-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Search</h1>
        
        <SearchBar initialQuery={q} initialType={type} />
        
        {q && (
          <div className="mt-12">
            <h2 className="text-xl text-gray-400 mb-6">
              Results for <span className="text-white font-bold">"{q}"</span>
            </h2>
            
            {results && results.results.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {results.results.map((item: any) => {
                  const publicRating = (typeof item.user_rating === "number" && item.user_rating > 0)
                    ? item.user_rating
                    : (typeof item.critic_score === "number" && item.critic_score > 0)
                      ? item.critic_score / 10
                      : null;

                  return (
                    <MovieCard
                      key={item.id}
                      id={item.id}
                      watchmodeId={item.id}
                      title={item.name || item.title || "Unknown"}
                      poster_path={getWatchmodeImageUrl(item.image_url || item.poster)}
                      poster={getWatchmodeImageUrl(item.image_url || item.poster)}
                      posterUrl={getWatchmodeImageUrl(item.image_url || item.poster)}
                      vote_average={publicRating !== null ? publicRating : undefined}
                      rating={publicRating}
                      year={item.year || (item.release_date ? parseInt(item.release_date) : undefined)}
                      release_date={item.year ? item.year.toString() : item.release_date || ""}
                      type={item.type === "tv_series" ? "series" : "movie"}
                      genres={item.genre_names ? item.genre_names.join(", ") : ""}
                      tmdbId={item.tmdb_id?.toString() || item.tmdbId?.toString()}
                      imdbId={item.imdb_id?.toString() || item.imdbId?.toString()}
                      tmdb_id={item.tmdb_id?.toString() || item.tmdbId?.toString()}
                      imdb_id={item.imdb_id?.toString() || item.imdbId?.toString()}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <p className="text-xl">No results found.</p>
                <p className="text-sm mt-2">Try adjusting your search terms or filters.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
