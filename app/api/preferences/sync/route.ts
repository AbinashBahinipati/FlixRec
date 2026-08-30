import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUsersCollection } from "@/lib/mongodb";
import { mergeMediaLists } from "@/lib/mediaIdentity";
import { MediaItem } from "@/components/MovieCard";


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
