"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, ArrowRight } from "lucide-react";
import { MovieCardProps } from "@/components/MovieCard";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export default function OnboardingFlow({ popularMovies }: { popularMovies: MovieCardProps[] }) {
  const router = useRouter();
  const [selectedMovies, setSelectedMovies] = useState<MovieCardProps[]>([]);
  const { toggleLike } = useUserPreferences();

  const handleSelect = (movie: MovieCardProps) => {
    setSelectedMovies(prev => {
      const isSelected = prev.some(m => m.id === movie.id);
      if (isSelected) return prev.filter(m => m.id !== movie.id);
      return [...prev, movie];
    });
  };

  const handleComplete = async () => {
    // Add selected movies to 'liked' state with resolution
    for (const m of selectedMovies) {
      await toggleLike(m);
    }
    router.push("/recommendations");
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">
          What kind of movies do you like?
        </h1>
        <p className="text-xl text-gray-400">
          Select at least 3 movies to get personalized recommendations.
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 mb-12">
        {popularMovies.map((movie) => {
          const isSelected = selectedMovies.some(m => m.id === movie.id);
          
          return (
            <div 
              key={movie.id} 
              onClick={() => handleSelect(movie)}
              className={`relative cursor-pointer transition-all duration-300 rounded-lg overflow-hidden border-4 ${
                isSelected ? 'border-primary scale-105 shadow-[0_0_20px_rgba(229,9,20,0.5)]' : 'border-transparent hover:scale-105'
              }`}
            >
              <div className="relative aspect-[2/3] w-full">
                <Image
                  src={movie.poster_path || movie.poster || movie.posterUrl || "/placeholder-poster.jpg"}
                  alt={movie.title}
                  fill
                  className="object-cover"
                />
                <div className={`absolute inset-0 bg-black/40 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                {isSelected && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary rounded-full p-2">
                    <Check className="w-6 h-6 text-white font-bold" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/90 to-transparent flex justify-center items-center z-50 pointer-events-none">
        <button
          onClick={handleComplete}
          disabled={selectedMovies.length < 3}
          className={`pointer-events-auto flex items-center gap-2 px-8 py-4 rounded-full font-bold text-lg transition-all ${
            selectedMovies.length >= 3 
              ? 'bg-primary text-white hover:bg-red-600 shadow-[0_0_30px_rgba(229,9,20,0.5)] translate-y-0 opacity-100' 
              : 'bg-white/10 text-white/30 cursor-not-allowed translate-y-4 opacity-0'
          }`}
        >
          Get Recommendations <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
