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

    const updatedLiked = updateMediaList(user.likedMedia || [], item, true);
    const updatedDisliked = updateMediaList(user.dislikedMedia || [], item, false);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          likedMedia: updatedLiked,
          dislikedMedia: updatedDisliked,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Liked successfully",
      likedMedia: updatedLiked,
      dislikedMedia: updatedDisliked,
    });
  } catch (error: any) {
    console.error("Error liking item:", error);
    return NextResponse.json({ error: error.message || "Failed to like item" }, { status: 500 });
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

    const updatedLiked = updateMediaList(user.likedMedia || [], item, false);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          likedMedia: updatedLiked,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Unliked successfully",
      likedMedia: updatedLiked,
    });
  } catch (error: any) {
    console.error("Error unliking item:", error);
    return NextResponse.json({ error: error.message || "Failed to unlike item" }, { status: 500 });
  }
}
