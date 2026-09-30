import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {/* Owner-only sign-in: sign-ups are disabled, so hide the "Sign up" footer link. */}
      <SignIn appearance={{ elements: { footerAction: { display: "none" } } }} />
    </div>
  );
}
