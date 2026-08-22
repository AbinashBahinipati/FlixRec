import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    return NextResponse.json({
      user: {
        id: user._id!.toString(),
        name: user.name,
        email: user.email,
        likedMedia: user.likedMedia || [],
        dislikedMedia: user.dislikedMedia || [],
        watchedMedia: user.watchedMedia || [],
        watchlist: user.watchlist || [],
        possibleToWatch: user.possibleToWatch || [],
        createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Auth me check error:", error);
    return NextResponse.json({ user: null, error: error.message }, { status: 500 });
  }
}
