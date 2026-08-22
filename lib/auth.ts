import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getUsersCollection } from "./mongodb";
import { ObjectId } from "mongodb";
import { UserDocument } from "./models/user";

export const SESSION_COOKIE_NAME = "flixrec_session";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET environment variable is required in production");
}
const secretKey = new TextEncoder().encode(JWT_SECRET || "dev_only_insecure_secret_do_not_use_in_prod");

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch (err) {
    return null;
  }
}

export async function getSessionUser(): Promise<UserDocument | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }

    const payload = await verifySessionToken(sessionCookie.value);
    if (!payload || !payload.userId) {
      return null;
    }

    const users = await getUsersCollection();
    let query: any;
    try {
      query = { _id: new ObjectId(payload.userId) };
    } catch {
      query = { email: payload.email.toLowerCase() };
    }

    const user = await users.findOne(query);
    return user || null;
  } catch (e) {
    console.error("Error reading session user:", e);
    return null;
  }
}
