"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Plus, ThumbsDown, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { isMediaInList } from "@/lib/mediaIdentity";

export interface MediaItem {
  id: number;
  watchmodeId?: number | string;
  imdbId?: string | null;
  tmdbId?: string | number | null;
  movieLensId?: number | null;
  ml_id?: number | null;
  title: string;
  year?: number | string | null;
  release_date?: string;
  type?: "movie" | "series" | "tv";
  poster_path?: string;
  poster?: string;
  posterUrl?: string;
  backdropUrl?: string;
  vote_average?: number;
  rating?: number;
  genres?: string | string[];
  overview?: string;
  resolved?: boolean;
  resolvableByML?: boolean;
  score?: number;
  source?: string;
  tmdb_id?: string;
  imdb_id?: string;
  className?: string;
}

export type MovieCardProps = MediaItem;

export default function MovieCard(props: MovieCardProps) {
  const { id, title, poster_path, vote_average, release_date, type = "movie", className } = props;
  const [isHovered, setIsHovered] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { liked, disliked, watched, watchlist, toggleLike, toggleDislike, toggleWatched, toggleWatchlist } = useUserPreferences();

  const isLiked = isMediaInList(liked, props);
  const isDisliked = isMediaInList(disliked, props);
  const isWatched = isMediaInList(watched, props);
  const isInWatchlist = isMediaInList(watchlist, props);


  // Separate Public Watchmode Rating from internal AI recommendation score
  const rawRating = typeof props.rating === "number" ? props.rating : typeof props.vote_average === "number" ? props.vote_average : null;
  const validRating = rawRating !== null && !isNaN(rawRating) && rawRating > 0 ? rawRating : null;

  return (
    <div 
      className={`relative group rounded-lg overflow-hidden transition-all duration-300 hover:z-20 hover:scale-105 ${className || "w-full"}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link href={`/${type === "movie" ? "movie" : "series"}/${id}`}>
        <div className="relative aspect-[2/3] w-full cursor-pointer">
          <Image
            src={poster_path || props.poster || props.posterUrl || "/placeholder-poster.jpg"}
            alt={title || "Poster"}
            fill
            className="object-cover rounded-lg"
            sizes="(max-width: 640px) 160px, (max-width: 768px) 200px, 240px"
          />
          {/* Public Watchmode Rating Badge */}
          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs font-bold text-white flex items-center">
            <span className="text-yellow-500 mr-1">★</span>
            {validRating !== null ? validRating.toFixed(1) : "N/A"}
          </div>
        </div>
      </Link>

      {/* Hover Information Layer */}
      <div 
        className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent transition-opacity duration-300 z-10 ${
          isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <Link href={`/${type === "movie" ? "movie" : "series"}/${id}`}>
          <h3 className="text-white font-bold text-sm sm:text-base truncate mb-1">{title}</h3>
          <p className="text-gray-400 text-xs mb-3">{release_date?.split("-")[0]}</p>
        </Link>
        
        <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          <button 
            onClick={async (e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              if(isProcessing) return; 
              setIsProcessing(true); 
              await toggleLike(props); 
              setIsProcessing(false); 
            }} 
            className={`p-2 rounded-full transition-colors ${isLiked ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} 
            title="Like"
          >
            <Heart className="w-4 h-4" />
          </button>
          <button 
            onClick={async (e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              if(isProcessing) return; 
              setIsProcessing(true); 
              await toggleWatchlist(props); 
              setIsProcessing(false); 
            }} 
            className={`p-2 rounded-full transition-colors ${isInWatchlist ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} 
            title="Watchlist"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button 
            onClick={async (e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              if(isProcessing) return; 
              setIsProcessing(true); 
              await toggleWatched(props); 
              setIsProcessing(false); 
            }} 
            className={`p-2 rounded-full transition-colors ${isWatched ? 'bg-green-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} 
            title="Watched"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
          <button 
            onClick={async (e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              if(isProcessing) return; 
              setIsProcessing(true); 
              await toggleDislike(props); 
              setIsProcessing(false); 
            }} 
            className={`p-2 rounded-full transition-colors ${isDisliked ? 'bg-gray-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} 
            title="Dislike"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
