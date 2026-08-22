"use client";

import { useEffect, useState, useRef } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { getUnifiedRecommendations } from "@/app/actions/recommendations";
import MovieCard, { MovieCardProps } from "@/components/MovieCard";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";

type RecommendationStatus =
  | "loading-preferences"
  | "ready-no-preferences"
  | "loading-recommendations"
  | "waking-backend"
  | "success"
  | "error";

export default function RecommendationsDashboard() {
  const {
    liked,
    disliked,
    watched,
    watchlist,
    preferencesReady,
    authLoading,
  } = useUserPreferences();

  const [recommendations, setRecommendations] = useState<MovieCardProps[]>([]);
  const [status, setStatus] = useState<RecommendationStatus>("loading-preferences");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);

  const requestIdRef = useRef(0);

  useEffect(() => {
    // 1. Guard: Wait for preferences to hydrate from localStorage and/or MongoDB
    if (!preferencesReady || authLoading) {
      setStatus("loading-preferences");
      return;
    }

    // 2. Identify effective liked media (fallback to watchlist if liked is empty)
    const effectiveLikes = liked.length > 0 ? liked : watchlist;
    const hasAnyPreferences = effectiveLikes.length > 0 || watched.length > 0;

    if (!hasAnyPreferences) {
      console.log("[FLIXREC] preferences ready:", preferencesReady);
      console.log("[FLIXREC] liked media: [] (no preferences found)");
      setStatus("ready-no-preferences");
      setRecommendations([]);
      return;
    }

    // 3. Initiate recommendation request with monotonic request ID
    const currentRequestId = ++requestIdRef.current;
    setStatus("loading-recommendations");
    setErrorMessage("");

    async function executeRecommendationFlow() {
      try {
        const likedValid = effectiveLikes
          .map((m) => m.movieLensId ?? m.ml_id)
          .filter((id): id is number => typeof id === "number" && !isNaN(id));

        const dislikedValid = disliked
          .map((m) => m.movieLensId ?? m.ml_id)
          .filter((id): id is number => typeof id === "number" && !isNaN(id));

        const watchedValid = watched
          .map((m) => m.movieLensId ?? m.ml_id)
          .filter((id): id is number => typeof id === "number" && !isNaN(id));

        const unresolvedLikes = effectiveLikes
          .filter((m) => !m.movieLensId && !m.ml_id)
          .map((m) => ({
            title: m.title,
            reason:
              m.type === "series" || m.type === "tv"
                ? "TV/Web series participate via content-based recommendations"
                : "MovieLens match not found",
          }));

        const unifiedPayload = {
          liked_movie_ids: likedValid,
          disliked_movie_ids: dislikedValid,
          watched_movie_ids: watchedValid,
          liked_media: effectiveLikes,
          disliked_media: disliked,
          watched_media: watched,
          n: 10,
          unresolved_likes: unresolvedLikes,
        };

        console.log("[FLIXREC] preferences ready:", preferencesReady);
        console.log("[FLIXREC] liked media:", effectiveLikes);
        console.log("[FLIXREC] disliked media:", disliked);
        console.log("[FLIXREC] watched media:", watched);
        console.log("[FLIXREC] recommendation request:", unifiedPayload);

        // ATTEMPT 1
        let res = await getUnifiedRecommendations(unifiedPayload);

        if (currentRequestId !== requestIdRef.current) return;

        if (res.success) {
          if (Array.isArray(res.recommendations) && res.recommendations.length > 0) {
            setRecommendations(res.recommendations);
            setStatus("success");
            return;
          } else {
            setRecommendations([]);
            setStatus("ready-no-preferences");
            return;
          }
        }

        // Check if error is due to Render cold start (retryable)
        if (res.isColdStart) {
          console.log("[FLIXREC] Backend waking up. Initiating bounded retry (Attempt 2 in 3s)...");
          setStatus("waking-backend");

          // Bounded backoff: wait ~3 seconds before Attempt 2
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if (currentRequestId !== requestIdRef.current) return;

          res = await getUnifiedRecommendations(unifiedPayload);
          if (currentRequestId !== requestIdRef.current) return;

          if (res.success) {
            if (Array.isArray(res.recommendations) && res.recommendations.length > 0) {
              setRecommendations(res.recommendations);
              setStatus("success");
              return;
            } else {
              setRecommendations([]);
              setStatus("ready-no-preferences");
              return;
            }
          }

          if (res.isColdStart) {
            console.log("[FLIXREC] Backend still warming. Initiating final bounded retry (Attempt 3 in 5s)...");
            // Bounded backoff: wait ~5 seconds before Attempt 3
            await new Promise((resolve) => setTimeout(resolve, 5000));
            if (currentRequestId !== requestIdRef.current) return;

            res = await getUnifiedRecommendations(unifiedPayload);
            if (currentRequestId !== requestIdRef.current) return;

            if (res.success) {
              if (Array.isArray(res.recommendations) && res.recommendations.length > 0) {
                setRecommendations(res.recommendations);
                setStatus("success");
                return;
              } else {
                setRecommendations([]);
                setStatus("ready-no-preferences");
                return;
              }
            }
          }
        }

        // If all 3 bounded retries failed or a non-retryable error occurred:
        setErrorMessage(
          res.isColdStart
            ? "Unable to load recommendations right now. Please try again."
            : res.error || "Unable to load recommendations right now. Please try again."
        );
        setStatus("error");
      } catch (error: any) {
        if (currentRequestId !== requestIdRef.current) return;
        console.error("[FLIXREC] Unexpected recommendation error:", error);
        setErrorMessage("Unable to load recommendations right now. Please try again.");
        setStatus("error");
      }
    }

    executeRecommendationFlow();
  }, [liked, disliked, watched, watchlist, preferencesReady, authLoading, retryCount]);

  // STATE A: Preferences are still hydrating or auth checking
  if (status === "loading-preferences") {
    return (
      <div className="flex flex-col justify-center items-center py-24 text-gray-400">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium animate-pulse">Loading your preferences...</p>
      </div>
    );
  }

  // STATE B: Recommendations in flight (fast path)
  if (status === "loading-recommendations") {
    return (
      <div className="flex flex-col justify-center items-center py-24 text-gray-400">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium">Generating your personalized AI recommendations...</p>
      </div>
    );
  }

  // STATE C: Render Backend Cold Start (Waking up)
  if (status === "waking-backend") {
    return (
      <div className="flex flex-col justify-center items-center py-24 text-gray-300 max-w-md mx-auto text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
        <h3 className="text-xl font-bold text-white mb-2">Recommendation engine is starting...</h3>
        <p className="text-sm text-gray-400 mb-6">
          Please wait a few seconds while the AI service connects and prepares your picks.
        </p>
        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
          <div className="bg-primary h-full rounded-full animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  // STATE D: Real Failure after bounded retries
  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-[#111] rounded-2xl border border-red-500/20 p-8 max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Unable to load recommendations right now</h3>
        <p className="text-sm text-gray-400 mb-6">
          {errorMessage || "Please check your connection and try again."}
        </p>
        <button
          onClick={() => setRetryCount((c) => c + 1)}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/80 text-white font-semibold rounded-xl transition-all cursor-pointer shadow-lg shadow-primary/20"
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  // STATE E: Preferences loaded and genuinely empty
  if (status === "ready-no-preferences" || recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-[#111] rounded-2xl border border-white/5 p-8 text-center">
        <Sparkles className="w-12 h-12 text-gray-600 mb-4" />
        <p className="text-xl font-semibold text-gray-300 mb-2">Not enough data</p>
        <p className="text-sm text-gray-400 max-w-md">
          Like or add movies and series to your watchlist to get AI-powered recommendations tailored to your taste.
        </p>
      </div>
    );
  }

  // STATE F: Successful recommendations
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Top AI Picks</h2>
        <button
          onClick={() => setRetryCount((c) => c + 1)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="Refresh recommendations"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {recommendations.map((item) => (
          <MovieCard key={item.id} {...item} />
        ))}
      </div>
    </div>
  );
}
