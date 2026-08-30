import { getMovieDetails, getWatchmodeImageUrl } from "@/lib/watchmode";
import Image from "next/image";
import { Heart, Plus, ThumbsDown, CheckCircle, Play } from "lucide-react";
import ContentRow from "@/components/ContentRow";
import ActionButtons from "@/components/ActionButtons";
import PlayTrailerButton from "@/components/PlayTrailerButton";

export const dynamic = "force-dynamic";

export default async function MovieDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const movie = await getMovieDetails(id);

  if (!movie) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-3xl font-bold text-white mb-4">Movie not found</h1>
        <p className="text-gray-400 max-w-md">
          We couldn't connect to the Watchmode API.
        </p>
      </div>
    );
  }

  const trailerUrl =
    movie.trailer ||
    (movie.title
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(
          movie.title + " official trailer"
        )}`
      : null);

  const formatRuntime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

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
      release_date: item.year ? item.year.toString() : item.release_date || "",
      type: "movie" as const,
      genres: item.genre_names ? item.genre_names.join(", ") : "",
      overview: item.plot_overview || "",
      tmdbId: item.tmdb_id?.toString() || item.tmdbId?.toString(),
      imdbId: item.imdb_id?.toString() || item.imdbId?.toString(),
      tmdb_id: item.tmdb_id?.toString() || item.tmdbId?.toString(),
      imdb_id: item.imdb_id?.toString() || item.imdbId?.toString(),
    };
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Backdrop */}
      <div className="relative w-full h-[50vh] sm:h-[70vh]">
        <Image
          src={getWatchmodeImageUrl(movie.backdrop, "original")}
          alt={movie.title}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10 pb-20">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div className="hidden md:block flex-shrink-0 w-64 rounded-xl overflow-hidden shadow-2xl border border-white/10">
            <div className="relative aspect-[2/3] w-full">
              <Image
                src={getWatchmodeImageUrl(movie.poster)}
                alt={movie.title}
                fill
                className="object-cover"
              />
            </div>
          </div>

          {/* Details */}
          <div className="flex-1">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">{movie.title}</h1>
            
            <div className="flex items-center gap-4 text-sm text-gray-300 font-medium mb-6">
              <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold tracking-wider">
                MOVIE
              </span>
              <span>{movie.year || "Unknown"}</span>
              <span className="flex items-center gap-1">
                <span className="text-yellow-500">★</span>
                {movie.user_rating ? movie.user_rating.toFixed(1) : "NR"}
              </span>
              <span>{movie.genre_names?.join(" • ") || "Unknown Genre"}</span>
            </div>

            <div className="flex flex-wrap gap-4 mb-8">
              <PlayTrailerButton
                title={movie.title}
                trailerUrl={movie.trailer}
              />
              
              <ActionButtons item={mapToCard(movie)} />
            </div>

            <h3 className="text-xl font-semibold mb-2">Overview</h3>
            <p className="text-gray-300 leading-relaxed max-w-3xl mb-8">
              {movie.plot_overview}
            </p>

            {movie.credits?.cast?.length > 0 && (
              <div className="mb-12">
                <h3 className="text-xl font-semibold mb-4">Cast</h3>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                  {movie.credits.cast.slice(0, 10).map((person: any) => (
                    <div key={person.id} className="w-24 flex-shrink-0 text-center">
                      <div className="w-24 h-24 relative rounded-full overflow-hidden mb-2 bg-gray-800">
                        {person.profile_path && (
                          <Image
                            src={getWatchmodeImageUrl(person.profile_path)}
                            alt={person.name}
                            fill
                            className="object-cover"
                          />
                        )}
                      </div>
                      <p className="text-xs font-semibold truncate">{person.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{person.character}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {movie.similar?.results?.length > 0 && (
          <div className="mt-8">
            <ContentRow 
              title="More Like This" 
              items={movie.similar.results.map(mapToCard)} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
