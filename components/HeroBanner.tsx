import { Play, Plus } from "lucide-react";
import Image from "next/image";

interface HeroBannerProps {
  movie: {
    title: string;
    plot_overview: string;
    backdrop: string;
    release_date: string;
    user_rating: number | null;
    genre: string;
  }
}

export default function HeroBanner({ movie }: HeroBannerProps) {
  return (
    <div className="relative w-full h-[70vh] sm:h-[80vh] flex items-center">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src={movie.backdrop}
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
            <span className="px-2 py-1 bg-primary/20 text-primary text-xs font-bold rounded">MOVIE</span>
            <span className="text-gray-300 text-sm">{movie.release_date.split("-")[0]}</span>
            <span className="text-gray-300 text-sm flex items-center">
              <span className="text-yellow-500 mr-1">★</span>
              {movie.user_rating ? movie.user_rating.toFixed(1) : "NR"}
            </span>
            <span className="text-gray-400 text-sm">{movie.genre}</span>
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-bold mb-4 drop-shadow-lg">
            {movie.title}
          </h1>
          
          <p className="text-gray-300 text-lg sm:text-xl mb-8 line-clamp-3 max-w-xl text-shadow">
            {movie.plot_overview}
          </p>
          
          <div className="flex flex-wrap items-center gap-4">
            <button className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors">
              <Play className="w-5 h-5 fill-black" />
              Watch Now
            </button>
            <button className="flex items-center gap-2 bg-[rgba(109,109,110,0.7)] text-white px-6 py-3 rounded-full font-bold hover:bg-[rgba(109,109,110,0.9)] transition-colors">
              <Plus className="w-5 h-5" />
              Watchlist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
