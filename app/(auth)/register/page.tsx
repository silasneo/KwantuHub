"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export default function Register() {
  const router = useRouter();
  const [role, setRole] = useState("BUYER");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    businessName: "",
  });
  const [error, setError] = useState("");
  useEffect(() => {
    setRole(
      new URLSearchParams(window.location.search).get("role") === "VENDOR"
        ? "VENDOR"
        : "BUYER",
    );
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role }),
    });
    if (r.ok) router.push(role === "VENDOR" ? "/vendor" : "/marketplace");
    else setError((await r.json()).error?.message || "Registration failed");
  }
  return (
    <main className="shell page">
      <div className="auth-card">
        <p className="eyebrow">
          {role === "VENDOR" ? "Vendor registration" : "Buyer registration"}
        </p>
        <h1>Join KwantuHub.</h1>
        <form className="form" onSubmit={submit}>
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          {role === "VENDOR" && (
            <label>
              Business name
              <input
                required
                value={form.businessName}
                onChange={(e) =>
                  setForm({ ...form, businessName: e.target.value })
                }
              />
            </label>
          )}
          <label>
            Password
            <input
              required
              minLength={8}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="button primary">Create account</button>
        </form>
        <p className="muted">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
