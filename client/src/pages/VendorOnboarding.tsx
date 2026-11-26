import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { ContactVerification } from "@/components/ContactVerification";

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
  const field = "w-full border border-[#d9d0c4] rounded p-3 bg-[#faf6f0]";
  const error = status.error || saveIdentity.error || startKyc.error || saveProfile.error;
  const contactsReady = Boolean(user?.emailVerifiedAt && user?.phoneVerifiedAt);
  return <div className="min-h-screen bg-[#f0e8dc]"><SiteHeader /><main className="max-w-2xl mx-auto p-6 my-8 bg-white rounded">
    <h1 className="font-serif text-4xl mb-5">Become a KwantuHub vendor</h1>
    {loading ? <p>Loading account...</p> : !user ? <Link href="/login?next=%2Fvendor%2Fonboarding" className="underline">Create an account or sign in</Link> : <>
      <p className="text-sm mb-4">Complete all three steps to activate automatically. Administrators may suspend or re-enable a vendor; there is no manual application approval.</p>
      <h2 className="font-serif text-2xl">Step 1 - Contact verification</h2>
      <ContactVerification showPhone />
      {contactsReady && <>
        <h2 className="font-serif text-2xl mb-4">Step 2 - Personal identity</h2>
        {status.data?.completed ? <p>Your onboarding is complete. <Link href="/vendor" className="underline">Open your vendor portal</Link>. Contact support for verified identity corrections.</p> :
          <form className="space-y-4" onSubmit={event => {
            event.preventDefault();
            if (!consent) return;
            saveIdentity.mutate({ firstName, lastName, dateOfBirth, city, address, countryCode, consentGiven: true, termsAccepted: true });
          }}>
            <label className="block">First name<input className={field} required maxLength={100} autoComplete="given-name" value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
            <label className="block">Surname<input className={field} required maxLength={100} autoComplete="family-name" value={lastName} onChange={event => setLastName(event.target.value)} /></label>
            <label className="block">Date of birth (18 or older)<input className={field} type="date" required autoComplete="bday" value={dateOfBirth} onChange={event => setDateOfBirth(event.target.value)} /></label>
            <label className="block">Country<select className={field} required value={countryCode} onChange={event => setCountryCode(event.target.value)}>
              <option value="" disabled>Select country</option>
              {countries.data?.map(item => <option key={item.countryCode} value={item.countryCode}>{item.name}</option>)}
            </select></label>
            <label className="block">City<input className={field} required autoComplete="address-level2" maxLength={160} value={city} onChange={event => setCity(event.target.value)} /></label>
            <label className="block">Address<input className={field} required minLength={5} maxLength={500} autoComplete="street-address" value={address} onChange={event => setAddress(event.target.value)} /></label>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I accept the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link> and consent to identity verification through Didit.</span></label>
            <button className="brand-button" disabled={saveIdentity.isPending || !consent}>Save personal details</button>
          </form>}
        {status.data?.details && (!status.data.completed || !status.data.kycVerified) && <div className="my-6 space-y-3">
          <p>Didit status: {status.data.kycStatus}{status.data.kycVerified ? " - verified" : ""}</p>
          {!status.data.kycVerified && <button type="button" className="brand-button" disabled={startKyc.isPending} onClick={() => startKyc.mutate()}>Start / resume Didit verification</button>}
          <button type="button" className="underline ml-3" onClick={() => status.refetch()}>Refresh verification status</button>
          {status.data.kycStatus === "in_review" && <p className="text-sm">Awaiting the signed identity decision or matching identity details. Returning from Didit does not mark verification complete.</p>}
        </div>}
        {status.data?.kycVerified && !status.data.completed && <form className="space-y-4 border-t pt-5" onSubmit={event => {
          event.preventDefault();
          saveProfile.mutate({ businessName, description, location: `${status.data.details?.city}, ${status.data.details?.countryCode}`,
            serviceArea, remoteAvailable: remote, contactEmail: contactEmail || undefined, website: website || undefined, standardsAcknowledged: standards });
        }}>
          <h2 className="font-serif text-2xl">Step 3 - Your storefront</h2>
          <label className="block">Business name<input className={field} required minLength={2} maxLength={180} value={businessName} onChange={event => setBusinessName(event.target.value)} /></label>
          <label className="block">Business description<textarea className={field} required maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label className="block">Service area<input className={field} maxLength={240} value={serviceArea} onChange={event => setServiceArea(event.target.value)} /></label>
          <label className="block">Public contact email<input className={field} type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></label>
          <label className="block">Website (HTTPS)<input className={field} type="url" value={website} onChange={event => setWebsite(event.target.value)} /></label>
          <label className="block"><input type="checkbox" checked={remote} onChange={event => setRemote(event.target.checked)} /> Remote services available</label>
          <label className="block"><input type="checkbox" required checked={standards} onChange={event => setStandards(event.target.checked)} /> I agree to the community standards in the Terms.</label>
          <button className="brand-button" disabled={saveProfile.isPending || !standards}>Activate vendor storefront</button>
        </form>}
      </>}
    </>}
    {error && <p role="alert" className="form-error my-4">{error.message}</p>}
  </main><SiteFooter /></div>;
}
