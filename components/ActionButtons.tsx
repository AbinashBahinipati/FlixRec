"use client";

import { Heart, Plus, ThumbsDown, CheckCircle, Loader2 } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { MovieCardProps } from "@/components/MovieCard";
import { isMediaInList } from "@/lib/mediaIdentity";
import { useState } from "react";

export default function ActionButtons({ item }: { item: MovieCardProps }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { 
    liked, disliked, watched, watchlist, 
    toggleLike, toggleDislike, toggleWatched, toggleWatchlist 
  } = useUserPreferences();

  const isLiked = isMediaInList(liked, item);
  const isDisliked = isMediaInList(disliked, item);
  const isWatched = isMediaInList(watched, item);
  const isInWatchlist = isMediaInList(watchlist, item);


  const handleAction = async (action: (item: MovieCardProps) => void | Promise<void>) => {
    if (isProcessing) return;
    setIsProcessing(true);
    await action(item);
    setIsProcessing(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button 
        onClick={() => handleAction(toggleLike)} 
        disabled={isProcessing}
        className={`p-3 rounded-full transition-colors ${isLiked ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white/20'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} 
        title="Like"
      >
        <Heart className="w-5 h-5" />
      </button>
      <button 
        onClick={() => handleAction(toggleWatchlist)} 
        disabled={isProcessing}
        className={`p-3 rounded-full transition-colors ${isInWatchlist ? 'bg-primary text-white' : 'bg-white/10 hover:bg-white/20'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} 
        title="Watchlist"
      >
        <Plus className="w-5 h-5" />
      </button>
      <button 
        onClick={() => handleAction(toggleWatched)} 
        disabled={isProcessing}
        className={`p-3 rounded-full transition-colors ${isWatched ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-white/20'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} 
        title="Watched"
      >
        <CheckCircle className="w-5 h-5" />
      </button>
      <button 
        onClick={() => handleAction(toggleDislike)} 
        disabled={isProcessing}
        className={`p-3 rounded-full transition-colors ${isDisliked ? 'bg-gray-500 text-white' : 'bg-white/10 hover:bg-white/20'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} 
        title="Dislike"
      >
        <ThumbsDown className="w-5 h-5" />
      </button>
    </div>
  );
}
