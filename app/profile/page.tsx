"use client";

import { useUserPreferences } from "@/hooks/useUserPreferences";
import ContentRow from "@/components/ContentRow";
import { User, LogOut, LogIn, Sparkles } from "lucide-react";

export default function ProfilePage() {
  const { user, isAuthenticated, logout, openAuthModal, liked, disliked, watched, watchlist, possible } = useUserPreferences();

  const formattedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "2026";

  return (
    <div className="min-h-screen bg-[#050505] pt-8 px-4 sm:px-6 lg:px-8 pb-20 text-white">
      <div className="max-w-7xl mx-auto">
        {/* User Card */}
        {isAuthenticated && user ? (
          <div className="flex flex-col md:flex-row items-center gap-6 mb-12 bg-[#111] p-8 rounded-2xl border border-white/5 shadow-xl">
            <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center border-2 border-primary text-primary font-bold text-3xl">
              {user.name ? user.name.charAt(0).toUpperCase() : <User className="w-12 h-12" />}
            </div>
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl font-bold mb-1">{user.name}</h1>
              <p className="text-gray-400 text-sm mb-1">{user.email}</p>
              <p className="text-gray-500 text-xs">Member since {formattedDate}</p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => logout()}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl transition-all text-sm font-semibold cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12 bg-gradient-to-r from-[#141414] via-[#1a1414] to-[#141414] p-8 rounded-2xl border border-primary/20 shadow-2xl">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/40 text-primary">
                <Sparkles className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold mb-1">Guest Account</h1>
                <p className="text-gray-400 text-sm">
                  Sign in or create an account to sync your likes and AI recommendations across devices.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => openAuthModal("signin")}
                className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-red-700 text-white rounded-xl font-bold transition shadow-lg hover:shadow-red-600/30 cursor-pointer text-sm"
              >
                <LogIn className="w-4 h-4" /> Sign In / Sign Up
              </button>
            </div>
          </div>
        )}
        
        {/* Content Rows */}
        <div className="space-y-12">
          {watchlist.length > 0 && <ContentRow title="My Watchlist" items={watchlist} />}
          {liked.length > 0 && <ContentRow title="Liked Content" items={liked} />}
          {watched.length > 0 && <ContentRow title="Watched History" items={watched} />}
          {possible.length > 0 && <ContentRow title="Possible to Watch" items={possible} />}
          {disliked.length > 0 && <ContentRow title="Disliked Content" items={disliked} />}
        </div>
        
        {liked.length === 0 && watchlist.length === 0 && watched.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-[#111] rounded-2xl border border-white/5">
            <p className="text-xl mb-2">No activity yet</p>
            <p className="text-sm">Start liking and watching movies to build your profile.</p>
          </div>
        )}
      </div>
    </div>
  );
}
