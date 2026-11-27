import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { authError, authField, authLabel, authLink, authNote, authPanel, authPrimary, authSecondary, authStatus } from "./AuthCard";

const codeField = `${authField} text-center text-xl font-semibold tracking-[0.5em]`;
const pill = (ok?: boolean) => `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-[#eef6ee] text-[#1f6b35]" : "bg-[#fff4e0] text-[#8a5a00]"}`;

function remaining(expiresAt: Date | null | undefined, now: number) {
  return expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now) / 1000)) : 0;
}

function countdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ContactVerification({ showPhone = false, heading = false }: { showPhone?: boolean; heading?: boolean }) {
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [phoneMessage, setPhoneMessage] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [now, setNow] = useState(Date.now);
  const utils = trpc.useUtils();
  const status = trpc.auth.contactStatus.useQuery();
  const countries = trpc.auth.phoneCountries.useQuery(undefined, { enabled: showPhone });
  const available = countries.data;
  const selected = available?.find(value => value.countryCode === country);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (available?.length && !available.some(value => value.countryCode === country)) {
      setCountry(available[0].countryCode);
      setPhone("");
    }
  }, [available, country]);
  const refresh = () => { status.refetch(); utils.auth.me.invalidate(); };
  const requestEmail = trpc.auth.requestEmailOtp.useMutation({
    onSuccess: data => {
      setNow(Date.now());
      setEmailCode("");
      setEmailMessage(data.verified ? "Email already verified." : `Code sent successfully to ${data.destination}.`);
      refresh();
    },
    onMutate: () => { setEmailMessage(""); },
  });
  const verifyEmail = trpc.auth.verifyEmailOtp.useMutation({
    onSuccess: () => { setEmailCode(""); setEmailMessage("Email verified."); refresh(); },
  });
  const requestPhone = trpc.auth.requestPhoneOtp.useMutation({
    onSuccess: data => {
      setNow(Date.now());
      setPhoneCode("");
      setPhoneMessage(`SMS code sent successfully to ${data.destination}.`);
      refresh();
    },
    onMutate: () => { setPhoneMessage(""); },
  });
  const verifyPhone = trpc.auth.verifyPhoneOtp.useMutation({
    onSuccess: () => { setPhoneCode(""); setEditingPhone(false); setPhoneMessage("Phone verified."); refresh(); },
  });
  const emailExpiry = requestEmail.data && !requestEmail.data.verified ? requestEmail.data.expiresAt : status.data?.email.expiresAt;
  const phoneExpiry = requestPhone.data?.expiresAt ?? status.data?.phone.expiresAt;
  const emailRemaining = remaining(emailExpiry, now);
  const phoneRemaining = remaining(phoneExpiry, now);
  const error = status.error || countries.error;
  const emailError = requestEmail.error || verifyEmail.error;
  const phoneError = requestPhone.error || verifyPhone.error;
  const field = "border border-[#d9d0c4] rounded p-2 w-full bg-white";
  return <section className="space-y-5">
    {heading && <h2 className="text-center font-serif text-2xl font-bold">Verify your contact details</h2>}
    <div className={authPanel}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="break-all font-semibold">{status.data?.email.value}</p><span className={pill(status.data?.email.verified)}>{status.data?.email.verified ? "Email verified" : "Email not verified"}</span></div>
      {!status.data?.email.verified && <>
        <button type="button" className={authSecondary} disabled={!status.data || requestEmail.isPending || emailRemaining > 0} onClick={() => requestEmail.mutate({})}>Send / resend email code</button>
        {emailMessage && <p role="status" className={authStatus}>{emailMessage}</p>}
        {emailRemaining > 0 ? <p className={`${authNote} text-center`}>Code expires in <span role="timer">{countdown(emailRemaining)}</span>. Resend becomes available after expiry.</p> :
          emailExpiry && <p className={`${authNote} text-center`}>Code expired. You can request a new email code.</p>}
        <label className={authLabel}>Email code<input className={codeField} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={event => setEmailCode(event.target.value.replace(/\D/g, ""))} /></label>
        <button type="button" className={authPrimary} disabled={verifyEmail.isPending || emailCode.length !== 6 || !emailRemaining} onClick={() => verifyEmail.mutate({ code: emailCode })}>Verify email</button>
      </>}
      {status.data?.email.verified && emailMessage && <p role="status" className={authStatus}>{emailMessage}</p>}
      {emailError && <p role="alert" className={authError}>{emailError.message}</p>}
    </div>
    {showPhone && <div className={authPanel}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Phone: {status.data?.phone.value || "Not added"}</p><span className={pill(status.data?.phone.verified)}>{status.data?.phone.verified ? "Verified" : "Not verified"}</span></div>
      {status.data?.phone.verified && !editingPhone && <button type="button" className={`${authLink} text-sm`} onClick={() => { setEditingPhone(true); requestPhone.reset(); setPhoneMessage(""); }}>Change phone number</button>}
      {(!status.data?.phone.verified || editingPhone) && <>
        <p className={authNote}>{status.data?.email.verified ? "" : "Verify email first. "}Choose an enabled SMS country. Changing a number requires verification again.</p>
        {countries.isLoading && <p>Loading available countries...</p>}
        {available?.length === 0 && <p role="alert">SMS verification is currently unavailable. Contact support.</p>}
        <label className={authLabel}>Country<select className={field} disabled={phoneRemaining > 0 || requestPhone.isPending} value={selected ? country : ""} onChange={event => { setCountry(event.target.value); setPhone(""); }}>
          {!selected && <option value="">Select a country</option>}
          {available?.map(value => <option key={value.countryCode} value={value.countryCode}>{value.name} ({value.callingCode})</option>)}
        </select></label>
        <label className={authLabel}>National phone number<input className={field} disabled={phoneRemaining > 0 || requestPhone.isPending} type="tel" autoComplete="tel-national" value={phone} onChange={event => setPhone(event.target.value)} /></label>
        <button type="button" className={authSecondary} disabled={!status.data?.email.verified || requestPhone.isPending || !phone || !selected || phoneRemaining > 0} onClick={() => {
          if (!selected) return;
          requestPhone.mutate({
            phone: parsePhoneNumberFromString(phone, selected.countryCode)?.number ?? phone,
            countryCode: selected.countryCode,
          });
        }}>Send / resend SMS code</button>
        {phoneError && <p role="alert" className={authError}>{phoneError.message}</p>}
        {phoneMessage && <p role="status" className={authStatus}>{phoneMessage}</p>}
        {phoneRemaining > 0 ? <p className={`${authNote} text-center`}>Code expires in <span role="timer">{countdown(phoneRemaining)}</span>. Resend becomes available after expiry.</p> :
          phoneExpiry && <p className={`${authNote} text-center`}>Code expired. You can request a new SMS code.</p>}
        <label className={authLabel}>SMS code<input className={codeField} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={phoneCode} onChange={event => setPhoneCode(event.target.value.replace(/\D/g, ""))} /></label>
        <button type="button" className={authPrimary} disabled={verifyPhone.isPending || phoneCode.length !== 6 || !phoneRemaining} onClick={() => verifyPhone.mutate({ code: phoneCode })}>Verify phone</button>
        {editingPhone && <button type="button" className={`${authLink} block mx-auto text-sm`} onClick={() => setEditingPhone(false)}>Cancel</button>}
      </>}
      {status.data?.phone.verified && !editingPhone && phoneMessage && <p role="status" className={authStatus}>{phoneMessage}</p>}
    </div>}
    <p className="text-center text-xs text-[#4b4843]">Codes expire after 10 minutes. Each code allows five incorrect attempts.</p>
    {error && <p role="alert" className={authError}>{error.message}</p>}
  </section>;
}
