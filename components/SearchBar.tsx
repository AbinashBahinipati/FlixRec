"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface SearchBarProps {
  initialQuery?: string;
  initialType?: string;
}

export default function SearchBar({ initialQuery = "", initialType = "movies" }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}&type=${type}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="w-full max-w-3xl">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for movies, series, or actors..."
            className="w-full pl-12 pr-4 py-4 bg-[#111] border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-500"
          />
        </div>
        
        <div className="flex gap-4">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="bg-[#111] border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer min-w-[120px]"
          >
            <option value="movies">Movies</option>
            <option value="series">Series</option>
          </select>
          
          <button
            type="submit"
            className="bg-primary hover:bg-red-700 text-white font-bold py-4 px-8 rounded-xl transition-colors"
          >
            Search
          </button>
        </div>
      </div>
    </form>
  );
}
