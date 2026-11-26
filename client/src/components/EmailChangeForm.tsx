import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import TurnstileField, { turnstileConfigured } from "./TurnstileField";
import { authError, authField, authLabel, authLink, authNote, authPanel, authPrimary, authSecondary, authStatus } from "./AuthCard";

export function EmailChangeForm() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string>();
  const [key, setKey] = useState(0);
  const send = trpc.auth.requestEmailChange.useMutation({ onSettled: () => { setToken(undefined); setKey(value => value + 1); } });
  const verify = trpc.auth.verifyEmailChange.useMutation({ onSuccess: () => {
    utils.auth.me.setData(undefined, null); utils.invalidate(); navigate("/login");
  } });
  if (!open) return <p className="mt-6 text-center text-sm">Wrong email address?{" "}
    <button type="button" className={authLink} onClick={() => setOpen(true)}>Correct your email</button></p>;
  return <section className={`${authPanel} mt-6`}>
    <h2 className="text-center font-serif text-2xl font-bold">Correct your email</h2>
    <p className={`${authNote} text-center`}>Confirm your current password and verify the new address. All sessions will be signed out.</p>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); send.mutate({ email, currentPassword: password, turnstileToken: token }); }}>
      <label className={authLabel}>New email<input className={authField} type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className={authLabel}>Current password<input className={authField} type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <div className="flex flex-col items-center"><TurnstileField key={key} action="email_otp" onToken={setToken} /></div>
      <button className={authSecondary} disabled={send.isPending || (turnstileConfigured && !token)}>Send new email code</button>
    </form>
    {send.data && <p role="status" className={authStatus}>Code sent to {send.data.destination}.</p>}
    <label className={authLabel}>New email code<input className={`${authField} text-center text-xl font-semibold tracking-[0.5em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} /></label>
    <button className={authPrimary} disabled={verify.isPending || code.length !== 6} onClick={() => verify.mutate({ code })}>Verify new email and sign out</button>
    {(send.error || verify.error) && <p role="alert" className={authError}>{send.error?.message || verify.error?.message}</p>}
    <button type="button" className={`${authLink} mx-auto block text-sm`} onClick={() => setOpen(false)}>Cancel</button>
  </section>;
}