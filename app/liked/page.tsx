"use client";

import { useUserPreferences } from "@/hooks/useUserPreferences";
import MovieCard from "@/components/MovieCard";

export default function LikedPage() {
  const { liked } = useUserPreferences();

  return (
    <div className="min-h-screen bg-[#050505] pt-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Liked Content</h1>
        
        {liked.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {liked.map((item) => (
              <MovieCard key={item.id} {...item} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-gray-500">
            <p className="text-xl font-semibold mb-2">You haven't liked anything yet</p>
            <p className="text-sm">Movies and series you like will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
