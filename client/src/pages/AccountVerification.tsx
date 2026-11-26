import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ContactVerification } from "@/components/ContactVerification";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { accountReturnPath } from "./LoginPage";
import { PendingRegistration } from "@/components/PendingRegistration";
import { EmailChangeForm } from "@/components/EmailChangeForm";

export default function AccountVerification() {
  const { user, loading, error } = useAuth();
  const [, navigate] = useLocation();
  const vendor = user?.signupIntent === "vendor";
  return <div className="min-h-screen bg-[#f0e8dc]"><SiteHeader /><main className="max-w-xl mx-auto p-6 bg-white my-8">
    <h1 className="font-serif text-3xl">Complete account verification</h1>
    {error ? <p role="alert" className="form-error">{error.message}</p> : loading ? <p>Loading account...</p> : !user ? <>
      <PendingRegistration />
      <Link className="block underline mt-4" href={`/login?next=${encodeURIComponent(accountReturnPath())}`}>Sign in to an existing account</Link>
    </> : <>
      <p>{vendor ? "Vendor step 1: verify email, then phone." : "Verify your email to finish buyer signup. No phone verification is required."}</p>
      <ContactVerification showPhone={vendor && Boolean(user.emailVerifiedAt)} />
      <button className="brand-button" disabled={!user.emailVerifiedAt}
        onClick={() => navigate(vendor ? "/vendor/onboarding" : accountReturnPath())}>Continue</button>
      {!user.emailVerifiedAt && <EmailChangeForm />}
    </>}
  </main><SiteFooter /></div>;
}
