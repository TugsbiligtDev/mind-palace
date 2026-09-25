import { Suspense } from "react";
import { LoginCard } from "@/components/profile/login-card";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <Suspense fallback={<div className="h-72" />}>
        <LoginCard />
      </Suspense>
    </div>
  );
}
