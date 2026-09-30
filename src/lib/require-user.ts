import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Resource-level auth check for API route handlers (proxy.ts only attaches Clerk's auth
// state; it no longer gates routes). Returns a 401 response to return early, or null if the
// caller is signed in:
//   const denied = await requireUser();
//   if (denied) return denied;
export async function requireUser(): Promise<NextResponse | null> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
