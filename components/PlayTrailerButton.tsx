"use client";

import { Play } from "lucide-react";
import { getMediaTrailerUrl } from "@/lib/trailer";

interface PlayTrailerButtonProps {
  title: string;
  trailerUrl?: string | null;
  className?: string;
}

export default function PlayTrailerButton({
  title,
  trailerUrl,
  className,
}: PlayTrailerButtonProps) {
  const finalTrailerUrl = getMediaTrailerUrl({ title, trailer: trailerUrl });

  if (!finalTrailerUrl) {
    return (
      <button
        disabled
        className={
          className ||
          "flex items-center gap-2 bg-white/20 text-white/50 px-6 py-3 rounded-full font-bold cursor-not-allowed"
        }
      >
        <Play className="w-5 h-5" />
        No Trailer
      </button>
    );
  }

  return (
    <a
      href={finalTrailerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ||
        "flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition-all duration-200 shadow-lg hover:scale-105 active:scale-95"
      }
    >
      <Play className="w-5 h-5 fill-black" />
      Play Trailer
    </a>
  );
}
