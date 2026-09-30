import { Home } from "@/components/home";
import { isOwner } from "@/lib/require-owner";

// Public page: viewers get a read-only UI, the owner gets everything. Write routes enforce
// ownership on the server regardless of what the UI shows.
export default async function Page() {
  return <Home readOnly={!(await isOwner())} />;
}
