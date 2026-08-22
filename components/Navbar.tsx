"use client";

import Link from "next/link";
import { Search, Heart, User, Clapperboard, Bookmark, LogIn } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export default function Navbar() {
  const { isAuthenticated, user, openAuthModal } = useUserPreferences();

  return (
    <nav className="fixed top-0 w-full z-50 bg-black/60 backdrop-blur-md border-b border-white/10 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 text-primary hover:text-red-500 transition-colors">
              <img src="/icon.png" alt="FlixRec" className="w-8 h-8 object-contain" />
              <span className="font-bold text-xl tracking-wider hidden sm:block">FLIXREC</span>
            </Link>
            
            <div className="hidden md:flex space-x-6">
              <Link href="/" className="text-sm font-medium text-gray-300 hover:text-white transition">Home</Link>
              <Link href="/movies" className="text-sm font-medium text-gray-300 hover:text-white transition">Movies</Link>
              <Link href="/series" className="text-sm font-medium text-gray-300 hover:text-white transition">Series</Link>
              <Link href="/recommendations" className="text-sm font-medium text-primary hover:text-red-400 transition">Recommendations</Link>
            </div>
          </div>

          <div className="flex items-center space-x-4 sm:space-x-6">
            <Link href="/search" className="text-gray-300 hover:text-white transition">
              <Search className="w-5 h-5" />
            </Link>
            <Link href="/watchlist" className="text-gray-300 hover:text-white transition">
              <Bookmark className="w-5 h-5" />
            </Link>
            <Link href="/liked" className="text-gray-300 hover:text-red-500 transition">
              <Heart className="w-5 h-5" />
            </Link>

            {isAuthenticated ? (
              <Link 
                href="/profile" 
                className="flex items-center gap-2 text-gray-300 hover:text-white transition group"
                title={user?.name || "Profile"}
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/50 text-primary font-bold text-xs flex items-center justify-center group-hover:bg-primary group-hover:text-white transition">
                  {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openAuthModal("signin")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-red-700 text-white transition shadow-sm"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
