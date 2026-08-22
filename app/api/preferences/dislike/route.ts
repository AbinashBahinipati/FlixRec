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

    const updatedDisliked = updateMediaList(user.dislikedMedia || [], item, true);
    const updatedLiked = updateMediaList(user.likedMedia || [], item, false);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          dislikedMedia: updatedDisliked,
          likedMedia: updatedLiked,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Disliked successfully",
      dislikedMedia: updatedDisliked,
      likedMedia: updatedLiked,
    });
  } catch (error: any) {
    console.error("Error disliking item:", error);
    return NextResponse.json({ error: error.message || "Failed to dislike item" }, { status: 500 });
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

    const updatedDisliked = updateMediaList(user.dislikedMedia || [], item, false);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          dislikedMedia: updatedDisliked,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Undisliked successfully",
      dislikedMedia: updatedDisliked,
    });
  } catch (error: any) {
    console.error("Error undisliking item:", error);
    return NextResponse.json({ error: error.message || "Failed to undislike item" }, { status: 500 });
  }
}
