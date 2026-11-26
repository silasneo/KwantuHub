import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { accountReturnPath } from "@/pages/LoginPage";

export function PendingRegistration() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const status = trpc.auth.registrationStatus.useQuery(undefined, { retry: false });
  const [now, setNow] = useState(Date.now);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const send = trpc.auth.requestRegistrationOtp.useMutation({
    onSuccess: () => { setNow(Date.now()); setCode(""); status.refetch(); },
  });
  const complete = trpc.auth.completeRegistration.useMutation({ onSuccess: data => {
    utils.auth.me.setData(undefined, data.user);
    utils.auth.registrationStatus.setData(undefined, null);
    navigate(data.user.signupIntent === "vendor" ? "/vendor/onboarding" : accountReturnPath());
  } });
  const cancel = trpc.auth.cancelRegistration.useMutation({ onSuccess: () => {
    utils.auth.registrationStatus.setData(undefined, null);
    navigate(`/login?mode=register&role=${status.data?.signupIntent || "buyer"}&next=${encodeURIComponent(accountReturnPath())}`);
  } });
  const expiry = send.data?.expiresAt ?? status.data?.codeExpiresAt;
  const seconds = expiry ? Math.max(0, Math.ceil((expiry.getTime() - now) / 1000)) : 0;
  const registrationExpired = Boolean(status.data && status.data.expiresAt.getTime() <= now);
  const failure = error || status.error?.message || send.error?.message || complete.error?.message || cancel.error?.message;
  const field = "w-full border border-[#d9d0c4] rounded p-3";
  return <section className="space-y-4 mt-5">
    {status.isLoading ? <p>Loading registration...</p> : !status.data || registrationExpired ?
      <p>No active registration. <Link className="underline" href="/login?mode=register">Start registration again</Link> or sign in to an existing account.</p> :
      <>
        <p>Verify <strong>{status.data.email}</strong>, then choose your password to create your account. No buyer profile or vendor privileges exist yet.</p>
        <p className="text-sm">Registration expires at {status.data.expiresAt.toLocaleString()}. Resuming or resending does not extend the 24-hour deadline.</p>
        <button className="brand-button" disabled={send.isPending || complete.isPending || seconds > 0}
          onClick={() => send.mutate()}>Send / resend email code</button>
        {send.data && <p role="status" className="text-sm">{send.data.message}</p>}
        {seconds > 0 ? <p className="text-sm">Code expires in <span role="timer">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>. Resend is available after expiry.</p> :
          expiry && <p>Code expired. Request a new code.</p>}
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault(); setError("");
          if (password !== confirmation) { setError("Passwords must match."); return; }
          complete.mutate({ code, password });
        }}>
          <label className="block">Email code<input className={field} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} /></label>
          <label className="block">Choose password<input className={field} required type="password" minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <p className="text-xs">At least 8 characters, at most 72 UTF-8 bytes.</p>
          <label className="block">Confirm password<input className={field} required type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
          <button className="brand-button" disabled={complete.isPending || send.isPending || seconds === 0}>Verify email and create account</button>
        </form>
        <button className="underline" disabled={cancel.isPending || complete.isPending} onClick={() => cancel.mutate()}>Cancel / correct email and start again</button>
      </>}
    {failure && <p role="alert" className="form-error">{failure}</p>}
  </section>;
}
