import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUsersCollection } from "@/lib/mongodb";
import { getMediaKey } from "@/lib/models/user";
import { MediaItem } from "@/components/MovieCard";

function mergeMediaLists(existing: MediaItem[] = [], incoming: MediaItem[] = []): MediaItem[] {
  const map = new Map<string, MediaItem>();
  for (const item of existing) {
    map.set(getMediaKey(item), item);
  }
  for (const item of incoming) {
    const key = getMediaKey(item);
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      // Merge properties if newer has more metadata
      map.set(key, { ...map.get(key), ...item });
    }
  }
  return Array.from(map.values());
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { liked = [], disliked = [], watched = [], watchlist = [], possible = [] } = await req.json();

    const mergedLiked = mergeMediaLists(user.likedMedia, liked);
    const mergedDisliked = mergeMediaLists(user.dislikedMedia, disliked);
    const mergedWatched = mergeMediaLists(user.watchedMedia, watched);
    const mergedWatchlist = mergeMediaLists(user.watchlist, watchlist);
    const mergedPossible = mergeMediaLists(user.possibleToWatch, possible);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          likedMedia: mergedLiked,
          dislikedMedia: mergedDisliked,
          watchedMedia: mergedWatched,
          watchlist: mergedWatchlist,
          possibleToWatch: mergedPossible,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Preferences synced successfully",
      preferences: {
        likedMedia: mergedLiked,
        dislikedMedia: mergedDisliked,
        watchedMedia: mergedWatched,
        watchlist: mergedWatchlist,
        possibleToWatch: mergedPossible,
      },
    });
  } catch (error: any) {
    console.error("Error syncing preferences:", error);
    return NextResponse.json({ error: error.message || "Failed to sync preferences" }, { status: 500 });
  }
}
