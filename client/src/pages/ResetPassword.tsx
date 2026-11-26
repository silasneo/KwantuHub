import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AuthCard, authError, authField, authLabel, authLink, authPrimary } from "@/components/AuthCard";

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
  return <AuthCard title="Choose a new password" subtitle={<p>All sessions will be signed out once your password changes.</p>}>
    {!token ? <p className="mt-6 text-center">This reset link is missing or has already been opened. <Link href="/login" className={authLink}>Request a new reset link</Link>.</p> :
      <form className="mt-8 space-y-5" onSubmit={event => {
        event.preventDefault(); setError("");
        if (password !== confirmation) { setError("Passwords must match."); return; }
        reset.mutate({ token, password });
      }}>
        <label className={authLabel}>New password<input className={authField} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className={authLabel}>Confirm password<input className={authField} type="password" required autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <p className="-mt-2 text-xs text-[#4b4843]">At least 8 characters, at most 72 UTF-8 bytes. All sessions will be signed out.</p>
        {(error || reset.error) && <p role="alert" className={authError}>{error || reset.error?.message}</p>}
        <button className={authPrimary} disabled={reset.isPending}>Reset password</button>
      </form>}
  </AuthCard>;
}