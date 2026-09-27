"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SessionUser = { name: string; role: "BUYER" | "VENDOR" | "ADMIN" };

export function AccountNav() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    fetch("/api/v1/auth/me").then(async (response) => {
      if (response.ok) setUser((await response.json()).data);
    });
  }, []);

  if (!user) return <Link href="/login">Sign in</Link>;
  const href =
    user.role === "ADMIN"
      ? "/admin"
      : user.role === "VENDOR"
        ? "/vendor"
        : "/account";
  return (
    <>
      <Link href={href}>{user.name}</Link>
      <button
        className="nav-button"
        onClick={async () => {
          await fetch("/api/v1/auth/logout", { method: "POST" });
          router.push("/");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </>
  );
}
