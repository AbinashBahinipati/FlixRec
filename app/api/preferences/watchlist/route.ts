import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUsersCollection } from "@/lib/mongodb";
import { updateMediaList } from "@/lib/models/user";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const item = await req.json();
    if (!item || (!item.id && !item.watchmodeId)) {
      return NextResponse.json({ error: "Invalid media item" }, { status: 400 });
    }

    const updatedWatchlist = updateMediaList(user.watchlist || [], item, true);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          watchlist: updatedWatchlist,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Added to watchlist",
      watchlist: updatedWatchlist,
    });
  } catch (error: any) {
    console.error("Error updating watchlist:", error);
    return NextResponse.json({ error: error.message || "Failed to update watchlist" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const item = await req.json();
    if (!item || (!item.id && !item.watchmodeId)) {
      return NextResponse.json({ error: "Invalid media item" }, { status: 400 });
    }

    const updatedWatchlist = updateMediaList(user.watchlist || [], item, false);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          watchlist: updatedWatchlist,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Removed from watchlist",
      watchlist: updatedWatchlist,
    });
  } catch (error: any) {
    console.error("Error removing from watchlist:", error);
    return NextResponse.json({ error: error.message || "Failed to remove from watchlist" }, { status: 500 });
  }
}
