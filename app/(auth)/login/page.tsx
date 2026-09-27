"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (r.ok) {
      const u = (await r.json()).data;
      router.push(
        u.role === "ADMIN"
          ? "/admin"
          : u.role === "VENDOR"
            ? "/vendor"
            : "/marketplace",
      );
    } else setError("Invalid email or password");
  }
  return (
    <main className="shell page">
      <div className="auth-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in.</h1>
        <form className="form" onSubmit={submit}>
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="button primary">Sign in</button>
        </form>
        <p className="muted">
          New here? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
