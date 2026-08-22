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

    const updatedPossible = updateMediaList(user.possibleToWatch || [], item, true);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          possibleToWatch: updatedPossible,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Added to possible list",
      possibleToWatch: updatedPossible,
    });
  } catch (error: any) {
    console.error("Error updating possible list:", error);
    return NextResponse.json({ error: error.message || "Failed to update possible list" }, { status: 500 });
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

    const updatedPossible = updateMediaList(user.possibleToWatch || [], item, false);

    const users = await getUsersCollection();
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          possibleToWatch: updatedPossible,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Removed from possible list",
      possibleToWatch: updatedPossible,
    });
  } catch (error: any) {
    console.error("Error removing from possible list:", error);
    return NextResponse.json({ error: error.message || "Failed to remove from possible list" }, { status: 500 });
  }
}
