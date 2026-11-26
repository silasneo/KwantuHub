import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import TurnstileField, { turnstileConfigured } from "./TurnstileField";

export function EmailChangeForm() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string>();
  const [key, setKey] = useState(0);
  const send = trpc.auth.requestEmailChange.useMutation({ onSettled: () => { setToken(undefined); setKey(value => value + 1); } });
  const verify = trpc.auth.verifyEmailChange.useMutation({ onSuccess: () => {
    utils.auth.me.setData(undefined, null); utils.invalidate(); navigate("/login");
  } });
  const field = "w-full border border-[#d9d0c4] rounded p-3";
  return <section className="space-y-4 border-t pt-5">
    <h2 className="font-serif text-2xl">Correct your email</h2>
    <p className="text-sm">Confirm your current password and verify the new address. All sessions will be signed out.</p>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); send.mutate({ email, currentPassword: password, turnstileToken: token }); }}>
      <label className="block">New email<input className={field} type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className="block">Current password<input className={field} type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <TurnstileField key={key} action="email_otp" onToken={setToken} />
      <button className="brand-button" disabled={send.isPending || (turnstileConfigured && !token)}>Send new email code</button>
    </form>
    {send.data && <p role="status">Code sent to {send.data.destination}.</p>}
    <label className="block">New email code<input className={field} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} /></label>
    <button className="brand-button" disabled={verify.isPending || code.length !== 6} onClick={() => verify.mutate({ code })}>Verify new email and sign out</button>
    {(send.error || verify.error) && <p role="alert" className="form-error">{send.error?.message || verify.error?.message}</p>}
  </section>;
}
