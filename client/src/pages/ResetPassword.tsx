import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function ResetPassword() {
  const [token] = useState(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(null, "", window.location.pathname);
    return token;
  });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const reset = trpc.auth.resetPassword.useMutation({ onSuccess: () => {
    utils.auth.me.setData(undefined, null); utils.invalidate(); navigate("/login?passwordChanged=1");
  } });
  return <div className="min-h-screen bg-[#f0e8dc]"><SiteHeader /><main className="max-w-lg mx-auto p-8 bg-white my-8">
    <h1 className="font-serif text-3xl mb-5">Choose a new password</h1>
    {!token ? <p>This reset link is missing or has already been opened. <Link href="/login" className="underline">Request a new reset link</Link>.</p> :
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault(); setError("");
        if (password !== confirmation) { setError("Passwords must match."); return; }
        reset.mutate({ token, password });
      }}>
        <label className="block">New password<input className="border p-3 w-full" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className="block">Confirm password<input className="border p-3 w-full" type="password" required autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <p className="text-xs">At least 8 characters, at most 72 UTF-8 bytes. All sessions will be signed out.</p>
        {(error || reset.error) && <p role="alert" className="form-error">{error || reset.error?.message}</p>}
        <button className="brand-button" disabled={reset.isPending}>Reset password</button>
      </form>}
  </main><SiteFooter /></div>;
}
