import { clerkMiddleware } from "@clerk/nextjs/server";

// Only attaches Clerk auth state to requests. Authorization is enforced per resource: pages
// call `auth.protect()` and API route handlers call `requireUser()` (src/lib/require-user.ts).
// /api/batch/cron is intentionally unauthenticated by Clerk — it checks CRON_SECRET itself.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
