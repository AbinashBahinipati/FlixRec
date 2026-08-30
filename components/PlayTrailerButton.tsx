"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import TrailerModal from "@/components/TrailerModal";

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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={
          className ||
          "flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition-all duration-200 shadow-lg hover:scale-105 active:scale-95"
        }
      >
        <Play className="w-5 h-5 fill-black" />
        Play Trailer
      </button>

      <TrailerModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        trailerUrl={trailerUrl}
      />
    </>
  );
}
