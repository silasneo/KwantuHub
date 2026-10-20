import { useState } from "react";
import { trpc } from "@/lib/trpc";
import TurnstileField from "@/components/TurnstileField";

export function ContactVerification() {
  const [phone, setPhone] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [emailToken, setEmailToken] = useState<string>();
  const [phoneToken, setPhoneToken] = useState<string>();
  const [message, setMessage] = useState("");
  const { data: status, refetch } = trpc.auth.contactStatus.useQuery();
  const requestEmail = trpc.auth.requestEmailOtp.useMutation({
    onSuccess: data => setMessage(`A code was sent to ${data.destination}.`),
  });
  const verifyEmail = trpc.auth.verifyEmailOtp.useMutation({
    onSuccess: () => {
      setEmailCode("");
      setMessage("Email verified.");
      refetch();
    },
  });
  const requestPhone = trpc.auth.requestPhoneOtp.useMutation({
    onSuccess: data => setMessage(`A code was sent to ${data.destination}.`),
  });
  const verifyPhone = trpc.auth.verifyPhoneOtp.useMutation({
    onSuccess: () => {
      setPhoneCode("");
      setMessage("Phone verified.");
      refetch();
    },
  });

  const error = requestEmail.error || verifyEmail.error || requestPhone.error || verifyPhone.error;
  return (
    <section className="mt-8 border-t border-[#eee8df] pt-6">
      <p className="text-xs font-bold uppercase tracking-widest text-[#d71466] mb-1">CONTACT TRUST</p>
      <h3 className="font-serif text-2xl font-bold text-[#0a0a0a]">Verify your contact details</h3>
      <p className="font-serif text-sm text-[#68635c] mt-1 mb-5">Verified contact ownership protects buyers, vendors, and the community from automated abuse.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded border border-[#d9d0c4] bg-[#faf6f0] p-4">
          <div className="flex items-center justify-between gap-3">
            <strong className="text-xs uppercase tracking-wider text-[#68635c]">Email</strong>
            <span className={`text-[10px] font-bold uppercase ${status?.email.verified ? "text-green-700" : "text-amber-700"}`}>{status?.email.verified ? "Verified" : "Unverified"}</span>
          </div>
          <p className="font-serif text-sm text-[#333] mt-2">{status?.email.value || "No email on file"}</p>
          {!status?.email.verified && (
            <>
              <TurnstileField action="email_otp" onToken={setEmailToken} />
              <button type="button" onClick={() => requestEmail.mutate({ turnstileToken: emailToken })} disabled={requestEmail.isPending || !status?.email.value} className="mt-2 text-xs font-bold uppercase tracking-wider text-white brand-gradient px-4 py-2 rounded disabled:opacity-50">{requestEmail.isPending ? "Sending…" : "Send email code"}</button>
              <div className="flex gap-2 mt-3">
                <input value={emailCode} onChange={event => setEmailCode(event.target.value)} inputMode="numeric" maxLength={6} placeholder="6-digit code" className="min-w-0 flex-1 border border-[#d9d0c4] rounded px-3 py-2 text-sm bg-white" />
                <button type="button" onClick={() => verifyEmail.mutate({ code: emailCode })} disabled={verifyEmail.isPending || emailCode.length !== 6} className="text-xs font-bold uppercase tracking-wider border border-[#0a0a0a] px-3 py-2 rounded disabled:opacity-50">Verify</button>
              </div>
            </>
          )}
        </div>
        <div className="rounded border border-[#d9d0c4] bg-[#faf6f0] p-4">
          <div className="flex items-center justify-between gap-3">
            <strong className="text-xs uppercase tracking-wider text-[#68635c]">Phone</strong>
            <span className={`text-[10px] font-bold uppercase ${status?.phone.verified ? "text-green-700" : "text-amber-700"}`}>{status?.phone.verified ? "Verified" : "Unverified"}</span>
          </div>
          <input value={phone || status?.phone.value || ""} onChange={event => setPhone(event.target.value)} placeholder="+1 713 555 0148" className="mt-2 w-full border border-[#d9d0c4] rounded px-3 py-2 text-sm bg-white" />
          {!status?.phone.verified && (
            <>
              <TurnstileField action="phone_otp" onToken={setPhoneToken} />
              <button type="button" onClick={() => requestPhone.mutate({ phone, turnstileToken: phoneToken })} disabled={requestPhone.isPending || phone.length < 10} className="mt-2 text-xs font-bold uppercase tracking-wider text-white brand-gradient px-4 py-2 rounded disabled:opacity-50">{requestPhone.isPending ? "Sending…" : "Send SMS code"}</button>
              <div className="flex gap-2 mt-3">
                <input value={phoneCode} onChange={event => setPhoneCode(event.target.value)} inputMode="numeric" maxLength={6} placeholder="6-digit code" className="min-w-0 flex-1 border border-[#d9d0c4] rounded px-3 py-2 text-sm bg-white" />
                <button type="button" onClick={() => verifyPhone.mutate({ code: phoneCode })} disabled={verifyPhone.isPending || phoneCode.length !== 6} className="text-xs font-bold uppercase tracking-wider border border-[#0a0a0a] px-3 py-2 rounded disabled:opacity-50">Verify</button>
              </div>
            </>
          )}
        </div>
      </div>
      {(message || error) && <p className={error ? "form-error mt-4" : "text-sm text-[#065f46] mt-4"}>{error?.message || message}</p>}
    </section>
  );
}
