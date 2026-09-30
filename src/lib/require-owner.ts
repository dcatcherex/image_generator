import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// The app has one owner (identified by OWNER_USER_ID, a Clerk user id) and public read-only
// viewers. Reads need no auth; every route that writes or spends money must call
// requireOwner(). Unset OWNER_USER_ID means nobody is the owner — fail closed.
export async function isOwner(): Promise<boolean> {
  // Call auth() before anything can return early: it's the request-time API that keeps the
  // home page dynamic — otherwise Next would prerender a build-time "not owner" answer.
  const { userId } = await auth();
  const ownerId = process.env.OWNER_USER_ID;
  return !!ownerId && userId === ownerId;
}

// Resource-level check for write route handlers. Returns a 403 response to return early, or
// null if the caller is the owner:
//   const denied = await requireOwner();
//   if (denied) return denied;
export async function requireOwner(): Promise<NextResponse | null> {
  if (await isOwner()) return null;
  return NextResponse.json({ error: "This is a view-only beta" }, { status: 403 });
}
