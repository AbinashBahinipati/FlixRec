"use client";

import { Plus, Check, Info } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { isMediaInList } from "@/lib/mediaIdentity";
import { MovieCardProps } from "@/components/MovieCard";
import PlayTrailerButton from "@/components/PlayTrailerButton";

interface HeroBannerProps {
  movie: {
    id?: number | string;
    watchmodeId?: number | string;
    title: string;
    plot_overview: string;
    backdrop: string;
    poster?: string;
    poster_path?: string;
    posterUrl?: string;
    release_date: string;
    year?: number | string;
    user_rating: number | null;
    rating?: number | null;
    genre: string;
    genres?: string;
    trailer?: string | null;
    type?: "movie" | "series" | "tv";
    tmdbId?: string;
    imdbId?: string;
  };
}

export default function HeroBanner({ movie }: HeroBannerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { watchlist, toggleWatchlist } = useUserPreferences();

  const mediaItem: MovieCardProps = {
    id: typeof movie.id === "number" ? movie.id : Number(movie.id) || 0,
    watchmodeId: movie.watchmodeId || movie.id,
    title: movie.title,
    poster_path: movie.poster || movie.poster_path || movie.posterUrl || movie.backdrop,
    poster: movie.poster || movie.poster_path || movie.posterUrl || movie.backdrop,
    backdropUrl: movie.backdrop,
    release_date: movie.release_date,
    year: typeof movie.year === "number" ? movie.year : movie.release_date ? parseInt(movie.release_date) : undefined,
    vote_average: movie.user_rating ?? movie.rating ?? undefined,
    rating: movie.user_rating ?? movie.rating ?? undefined,
    genres: movie.genre || movie.genres || "",
    overview: movie.plot_overview,
    type: (movie.type as "movie" | "series") || "movie",
    tmdbId: movie.tmdbId,
    imdbId: movie.imdbId,
  };

  const isInWatchlist = isMediaInList(watchlist, mediaItem);

  const handleWatchlistToggle = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await toggleWatchlist(mediaItem);
    } finally {
      setIsProcessing(false);
    }
  };

  const trailerUrl =
    movie.trailer ||
    (movie.title
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(
          movie.title + " official trailer"
        )}`
      : null);

  const releaseYear = movie.release_date
    ? movie.release_date.split("-")[0]
    : movie.year
    ? String(movie.year)
    : "";

  return (
    <div className="relative w-full h-[70vh] sm:h-[80vh] flex items-center">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src={movie.backdrop || "/placeholder-poster.jpg"}
          alt={movie.title}
          fill
          className="object-cover"
          priority
        />
        {/* Gradients for cinematic look */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/80 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="max-w-2xl">
          <div className="flex items-center space-x-3 mb-4">
            <span className="px-2 py-1 bg-red-600/90 text-white text-xs font-bold rounded tracking-wider">
              {movie.type === "series" ? "SERIES" : "MOVIE"}
            </span>
            {releaseYear && <span className="text-gray-300 text-sm">{releaseYear}</span>}
            <span className="text-gray-300 text-sm flex items-center">
              <span className="text-yellow-500 mr-1">★</span>
              {movie.user_rating ? movie.user_rating.toFixed(1) : (movie.rating ? movie.rating.toFixed(1) : "NR")}
            </span>
            {movie.genre && <span className="text-gray-400 text-sm">{movie.genre}</span>}
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-bold mb-4 drop-shadow-lg text-white">
            {movie.title}
          </h1>
          
          <p className="text-gray-300 text-lg sm:text-xl mb-8 line-clamp-3 max-w-xl text-shadow">
            {movie.plot_overview}
          </p>
          
          <div className="flex flex-wrap items-center gap-4">
            <PlayTrailerButton
              title={movie.title}
              trailerUrl={movie.trailer}
            />

            <button
              onClick={handleWatchlistToggle}
              disabled={isProcessing}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all duration-200 hover:scale-105 active:scale-95 ${
                isInWatchlist
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-[rgba(109,109,110,0.7)] text-white hover:bg-[rgba(109,109,110,0.9)]"
              } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isInWatchlist ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {isInWatchlist ? "In Watchlist" : "Watchlist"}
            </button>

            {movie.id && (
              <Link
                href={`/${movie.type === "series" ? "series" : "movie"}/${movie.id}`}
                className="flex items-center gap-2 bg-white/15 text-white hover:bg-white/25 px-5 py-3 rounded-full font-bold transition-all duration-200 backdrop-blur-sm hover:scale-105 active:scale-95"
              >
                <Info className="w-5 h-5" />
                Details
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
