/**
 * Helper to resolve the correct YouTube trailer URL for media items.
 */
export function getMediaTrailerUrl(media: {
  title?: string;
  name?: string;
  trailer?: string | null;
}): string | null {
  const rawTitle = (media.title || media.name || "").trim().toLowerCase();

  // Specific override for "Facing El Chapo" / "La Captura"
  if (
    rawTitle.includes("facing el chapo") ||
    rawTitle.includes("el chapo") ||
    rawTitle.includes("la captura")
  ) {
    return "https://www.youtube.com/watch?v=cCBC4HX4XqE";
  }

  // If a valid direct trailer URL is provided from API, use it
  if (media.trailer && typeof media.trailer === "string" && media.trailer.trim()) {
    return media.trailer.trim();
  }

  // Fallback to official YouTube trailer search for any other title
  if (media.title || media.name) {
    const query = `${media.title || media.name} official trailer`;
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }

  return null;
}
