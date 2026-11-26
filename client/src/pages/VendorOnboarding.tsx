import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AuthCard, authError, authField, authLabel, authLink, authNote, authPanel, authPrimary, authStatus } from "@/components/AuthCard";
import { ContactVerification } from "@/components/ContactVerification";

const neutral = "bg-[#f5f1eb] text-[#4b4843]";
const waiting = "bg-[#fff4e0] text-[#8a5a00]";
function describeKyc(status: string | undefined, verified: boolean) {
  const start = "Takes about 2 minutes. You'll scan a photo ID and take a quick selfie with our secure partner, Didit, then return here.";
  if (verified) return { label: "Verified", tone: "bg-[#eef6ee] text-[#1f6b35]", help: "Your identity is confirmed. Continue to step 3.", action: "", canStart: false };
  switch (status) {
    case "created": return { label: "Started, not finished", tone: waiting, help: `Pick up where you left off. ${start}`, action: "Continue identity verification", canStart: true };
    case "submitted":
    case "in_review": return { label: "Under review", tone: waiting, help: "Thanks, your documents were submitted. Most checks finish within a few minutes; this page updates automatically. If your details don't match your ID, we'll review them manually.", action: "Reopen verification", canStart: true };
    case "declined": return { label: "Not approved", tone: "bg-[#fdecef] text-[#a3123f]", help: "We couldn't verify your identity. Check that the name and date of birth above match your ID exactly, save, then try again.", action: "Try again", canStart: true };
    case "expired":
    case "abandoned": return { label: "Session expired", tone: neutral, help: `Your previous session timed out. ${start}`, action: "Start a new verification", canStart: true };
    default: return { label: "Not started", tone: neutral, help: start, action: "Verify my identity", canStart: true };
  }
}

export default function VendorOnboarding() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const status = trpc.auth.onboardingStatus.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 10_000 });
  const hydrated = useRef(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [remote, setRemote] = useState(false);
  const [standards, setStandards] = useState(false);
  useEffect(() => {
    if (!user || !status.isSuccess || hydrated.current) return;
    const details = status.data.details;
    setFirstName(details?.firstName || user.firstName || "");
    setLastName(details?.lastName || user.lastName || "");
    setDateOfBirth(details?.dateOfBirth || "");
    setCity(details?.city || ""); setAddress(details?.address || "");
    setCountryCode(details?.countryCode || "");
    hydrated.current = true;
  }, [user, status.isSuccess, status.data]);
  const countries = trpc.auth.phoneCountries.useQuery(undefined, { enabled: Boolean(user) });
  const saveIdentity = trpc.auth.saveVendorIdentity.useMutation({ onSuccess: () => status.refetch() });
  const startKyc = trpc.auth.startVendorKyc.useMutation({ onSuccess: data => {
    status.refetch();
    window.location.assign(data.verificationUrl);
  } });
  const saveProfile = trpc.vendor.saveProfile.useMutation({ onSuccess: async () => {
    await utils.auth.me.invalidate(); navigate("/vendor");
  } });
  const field = authField;
  const label = authLabel;
  const check = "flex items-start gap-3 text-sm leading-relaxed";
  const box = "mt-1 h-4 w-4 shrink-0 accent-[#0a0a0a]";
  const sectionTitle = "font-serif text-2xl font-bold";
  const error = status.error || saveIdentity.error || saveProfile.error;
  const kycView = describeKyc(status.data?.kycStatus, Boolean(status.data?.kycVerified));
  const contactsReady = Boolean(user?.emailVerifiedAt && user?.phoneVerifiedAt);
  const steps = [
    { name: "Contact", done: contactsReady },
    { name: "Identity", done: Boolean(status.data?.kycVerified) },
    { name: "Storefront", done: Boolean(status.data?.completed) },
  ];
  const current = steps.findIndex(step => !step.done);
  return <AuthCard wide footer={false} title="Become a KwantuHub vendor"
    subtitle={user && !loading ? <p>Complete all three steps to activate automatically. Administrators may suspend or re-enable a vendor; there is no manual application approval.</p> : undefined}>
    <div className="mt-8 space-y-8">
    {loading ? <p className="text-center">Loading account...</p> : !user ? <Link href="/login?next=%2Fvendor%2Fonboarding" className={`${authPrimary} block text-center`}>Create an account or sign in</Link> : <>
      <ol className="flex items-center justify-center gap-2 sm:gap-3" aria-label="Onboarding progress">
        {steps.map((step, index) => <li key={step.name} className="flex items-center gap-2 sm:gap-3">
          {index > 0 && <span className="h-px w-5 bg-[#cfc5b8] sm:w-8" aria-hidden="true" />}
          <span aria-current={index === current ? "step" : undefined} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${step.done ? "bg-[#eef6ee] text-[#1f6b35]" : index === current ? "bg-[#0a0a0a] text-white" : "bg-[#f5f1eb] text-[#4b4843]"}`}>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px]">{step.done ? "✓" : index + 1}</span>{step.name}
          </span>
        </li>)}
      </ol>
      <section className="space-y-4">
        <h2 className={`${sectionTitle} text-center`}>Step 1 - Contact verification</h2>
        <ContactVerification showPhone />
      </section>
      {contactsReady && <>
        <section className="space-y-4 border-t border-[#e4dcd0] pt-8">
        <h2 className={`${sectionTitle} text-center`}>Step 2 - Personal identity</h2>
        {status.data?.completed ? <p className={`${authStatus} text-center`}>Your onboarding is complete. <Link href="/vendor" className={authLink}>Open your vendor portal</Link>. Contact support for verified identity corrections.</p> :
          <form className="space-y-4" onSubmit={event => {
            event.preventDefault();
            if (!consent) return;
            saveIdentity.mutate({ firstName, lastName, dateOfBirth, city, address, countryCode, consentGiven: true, termsAccepted: true });
          }}>
            <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>First name<input className={field} required maxLength={100} autoComplete="given-name" value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
            <label className={label}>Surname<input className={field} required maxLength={100} autoComplete="family-name" value={lastName} onChange={event => setLastName(event.target.value)} /></label>
            </div>
            <label className={label}>Date of birth (18 or older)<input className={field} type="date" required autoComplete="bday" value={dateOfBirth} onChange={event => setDateOfBirth(event.target.value)} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>Country<select className={field} required value={countryCode} onChange={event => setCountryCode(event.target.value)}>
              <option value="" disabled>Select country</option>
              {countries.data?.map(item => <option key={item.countryCode} value={item.countryCode}>{item.name}</option>)}
            </select></label>
            <label className={label}>City<input className={field} required autoComplete="address-level2" maxLength={160} value={city} onChange={event => setCity(event.target.value)} /></label>
            </div>
            <label className={label}>Address<input className={field} required minLength={5} maxLength={500} autoComplete="street-address" value={address} onChange={event => setAddress(event.target.value)} /></label>
            <label className={check}><input className={box} type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I accept the <Link href="/terms" className={authLink}>Terms</Link> and <Link href="/privacy" className={authLink}>Privacy Policy</Link> and consent to identity verification through Didit, our secure verification partner.</span></label>
            <p className={authNote}>Enter your name and date of birth exactly as they appear on your photo ID.</p>
            <button className={authPrimary} disabled={saveIdentity.isPending || !consent}>{saveIdentity.isPending ? "Saving..." : status.data?.details ? "Update personal details" : "Save and continue"}</button>
            {saveIdentity.isSuccess && <p role="status" className={`${authStatus} text-center`}>Details saved. Now verify your identity below.</p>}
          </form>}
        {status.data?.details && (!status.data.completed || !status.data.kycVerified) && <div className={`${authPanel} text-center`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#4b4843]">Identity verification status</p>
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${kycView.tone}`}>{kycView.label}</span>
          <p className={authNote}>{kycView.help}</p>
          {!status.data.kycVerified && kycView.canStart && <button type="button" className={authPrimary} disabled={startKyc.isPending} onClick={() => startKyc.mutate()}>
            {startKyc.isPending ? "Opening secure verification..." : kycView.action}
          </button>}
          {startKyc.error && <p role="alert" className={authError}>We couldn't start identity verification right now. Please try again in a few minutes, or contact support if this keeps happening.</p>}
          <button type="button" className={`${authLink} text-sm`} disabled={status.isFetching} onClick={() => status.refetch()}>{status.isFetching ? "Checking..." : "Check verification status"}</button>
        </div>}
        </section>
        {status.data?.kycVerified && !status.data.completed && <form className="space-y-4 border-t border-[#e4dcd0] pt-8" onSubmit={event => {
          event.preventDefault();
          saveProfile.mutate({ businessName, description, location: `${status.data.details?.city}, ${status.data.details?.countryCode}`,
            serviceArea, remoteAvailable: remote, contactEmail: contactEmail || undefined, website: website || undefined, standardsAcknowledged: standards });
        }}>
          <h2 className={`${sectionTitle} text-center`}>Step 3 - Your storefront</h2>
          <label className={label}>Business name<input className={field} required minLength={2} maxLength={180} value={businessName} onChange={event => setBusinessName(event.target.value)} /></label>
          <label className={label}>Business description<textarea className={`${field} min-h-32`} required maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label className={label}>Service area<input className={field} maxLength={240} value={serviceArea} onChange={event => setServiceArea(event.target.value)} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>Public contact email<input className={field} type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></label>
          <label className={label}>Website (HTTPS)<input className={field} type="url" value={website} onChange={event => setWebsite(event.target.value)} /></label>
          </div>
          <label className={check}><input className={box} type="checkbox" checked={remote} onChange={event => setRemote(event.target.checked)} /><span>Remote services available</span></label>
          <label className={check}><input className={box} type="checkbox" required checked={standards} onChange={event => setStandards(event.target.checked)} /><span>I agree to the community standards in the Terms.</span></label>
          <button className={authPrimary} disabled={saveProfile.isPending || !standards}>Activate vendor storefront</button>
        </form>}
      </>}
    </>}
    {error && <p role="alert" className={authError}>{error.message}</p>}
    </div>
  </AuthCard>;
}