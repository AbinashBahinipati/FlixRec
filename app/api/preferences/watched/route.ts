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

    const updatedWatched = updateMediaList(user.watchedMedia || [], item, true);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          watchedMedia: updatedWatched,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Marked as watched",
      watchedMedia: updatedWatched,
    });
  } catch (error: any) {
    console.error("Error marking watched:", error);
    return NextResponse.json({ error: error.message || "Failed to mark as watched" }, { status: 500 });
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

    const updatedWatched = updateMediaList(user.watchedMedia || [], item, false);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          watchedMedia: updatedWatched,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Unmarked watched",
      watchedMedia: updatedWatched,
    });
  } catch (error: any) {
    console.error("Error unmarking watched:", error);
    return NextResponse.json({ error: error.message || "Failed to unmark watched" }, { status: 500 });
  }
}
