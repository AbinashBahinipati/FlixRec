"use client";

import { useEffect, useState } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { getUnifiedRecommendations } from "@/app/actions/recommendations";
import MovieCard, { MovieCardProps } from "@/components/MovieCard";

export default function RecommendationsDashboard() {
  const { liked, disliked, watched, watchlist } = useUserPreferences();
  const [recommendations, setRecommendations] = useState<MovieCardProps[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecommendations() {
      setLoading(true);
      try {
        const likedValid = liked
          .map(m => m.movieLensId ?? m.ml_id)
          .filter((id): id is number => typeof id === "number" && !isNaN(id));
          
        const dislikedValid = disliked
          .map(m => m.movieLensId ?? m.ml_id)
          .filter((id): id is number => typeof id === "number" && !isNaN(id));
          
        const watchedValid = watched
          .map(m => m.movieLensId ?? m.ml_id)
          .filter((id): id is number => typeof id === "number" && !isNaN(id));

        const unresolvedLikes = liked
          .filter(m => !m.movieLensId && !m.ml_id)
          .map(m => ({
            title: m.title,
            reason: (m.type === "series" || m.type === "tv") ? "TV/Web series participate via content-based recommendations" : "MovieLens match not found"
          }));

        const unifiedPayload = {
          liked_movie_ids: likedValid,
          disliked_movie_ids: dislikedValid,
          watched_movie_ids: watchedValid,
          liked_media: liked,
          disliked_media: disliked,
          watched_media: watched,
          n: 10,
          unresolved_likes: unresolvedLikes
        };
        
        console.log("LIKED MEDIA:", liked);
        console.log("RESOLVED MOVIELENS IDS:", likedValid);
        console.log("UNRESOLVED MEDIA:", unresolvedLikes);
        console.log("FINAL RECOMMENDATION PAYLOAD:", unifiedPayload);

        const recs = await getUnifiedRecommendations(unifiedPayload);
        setRecommendations(recs as any);
      } catch (error) {
        console.error("Failed to fetch recommendations", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRecommendations();
  }, [liked, disliked, watched, watchlist]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-[#111] rounded-2xl border border-white/5">
        <p className="text-xl mb-2">Not enough data</p>
        <p className="text-sm">Like or add movies to your watchlist to get recommendations.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Top AI Picks</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {recommendations.map((item) => (
          <MovieCard key={item.id} {...item} />
        ))}
      </div>
    </div>
  );
}
