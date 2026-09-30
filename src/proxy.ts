import { clerkMiddleware } from "@clerk/nextjs/server";

// Only attaches Clerk auth state to requests. Pages and read routes are public (view-only
// beta); every write route handler calls `requireOwner()` (src/lib/require-owner.ts).
// /api/batch/cron is intentionally unauthenticated by Clerk — it checks CRON_SECRET itself.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
