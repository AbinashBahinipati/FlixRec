"use client";

import { X, ExternalLink } from "lucide-react";
import { useEffect } from "react";

interface TrailerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  trailerUrl?: string | null;
}

export function getYouTubeEmbedUrl(trailerUrl?: string | null, title?: string): string | null {
  if (trailerUrl) {
    const watchMatch = trailerUrl.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/i
    );
    if (watchMatch && watchMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/${watchMatch[1]}?autoplay=1&rel=0`;
    }
    if (trailerUrl.includes("/embed/")) {
      try {
        const url = new URL(trailerUrl);
        url.searchParams.set("autoplay", "1");
        return url.toString();
      } catch {
        return `${trailerUrl}?autoplay=1`;
      }
    }
  }

  if (title) {
    return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(
      title + " official trailer"
    )}&autoplay=1`;
  }

  return null;
}

export default function TrailerModal({
  isOpen,
  onClose,
  title,
  trailerUrl,
}: TrailerModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const embedUrl = getYouTubeEmbedUrl(trailerUrl, title);
  const directWatchUrl =
    trailerUrl ||
    `https://www.youtube.com/results?search_query=${encodeURIComponent(
      title + " official trailer"
    )}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-[#111] border border-white/15 rounded-2xl overflow-hidden shadow-2xl shadow-black/90 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/40">
          <div className="flex items-center space-x-3 min-w-0">
            <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded uppercase tracking-wider shrink-0">
              Trailer
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              {title}
            </h2>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <a
              href={directWatchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Open in YouTube"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Player Frame */}
        <div className="relative aspect-video w-full bg-black">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={`${title} Trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Trailer unavailable for this title
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
