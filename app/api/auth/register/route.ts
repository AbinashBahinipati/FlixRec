import { NextRequest, NextResponse } from "next/server";
import { getUsersCollection } from "@/lib/mongodb";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { UserDocument } from "@/lib/models/user";

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid JSON request body",
        },
        { status: 400 }
      );
    }

    const { name, email, password, initialPreferences } = body || {};

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "Email and password are required",
        },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        {
          success: false,
          message: "Password must be at least 6 characters",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const userName = (name && typeof name === "string" && name.trim()) ? name.trim() : normalizedEmail.split("@")[0];

    const users = await getUsersCollection();
    const existing = await users.findOne({ email: normalizedEmail });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message: "An account with this email already exists",
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const now = new Date();

    const newUser: UserDocument = {
      name: userName,
      email: normalizedEmail,
      passwordHash,
      likedMedia: Array.isArray(initialPreferences?.liked) ? initialPreferences.liked : [],
      dislikedMedia: Array.isArray(initialPreferences?.disliked) ? initialPreferences.disliked : [],
      watchedMedia: Array.isArray(initialPreferences?.watched) ? initialPreferences.watched : [],
      watchlist: Array.isArray(initialPreferences?.watchlist) ? initialPreferences.watchlist : [],
      possibleToWatch: Array.isArray(initialPreferences?.possible) ? initialPreferences.possible : [],
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await users.insertOne(newUser);
    const userId = insertResult.insertedId.toString();

    const token = await createSessionToken({
      userId,
      email: normalizedEmail,
      name: userName,
    });

    const response = NextResponse.json(
      {
        success: true,
        message: "Account created successfully",
        user: {
          id: userId,
          name: userName,
          email: normalizedEmail,
          likedMedia: newUser.likedMedia,
          dislikedMedia: newUser.dislikedMedia,
          watchedMedia: newUser.watchedMedia,
          watchlist: newUser.watchlist,
          possibleToWatch: newUser.possibleToWatch,
          createdAt: now.toISOString(),
        },
      },
      { status: 201 }
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to register account",
      },
      { status: 500 }
    );
  }
}
