import { auth } from "@clerk/nextjs/server";
import { Home } from "@/components/home";

// Resource-level auth check: proxy.ts no longer gates routes, so protect the page here.
export default async function Page() {
  await auth.protect();
  return <Home />;
}
