import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ContactVerification } from "@/components/ContactVerification";
import { accountReturnPath } from "./LoginPage";
import { PendingRegistration } from "@/components/PendingRegistration";
import { EmailChangeForm } from "@/components/EmailChangeForm";
import { AuthCard, authError, authLink, authPrimary } from "@/components/AuthCard";

export default function AccountVerification() {
  const { user, loading, error } = useAuth();
  const [, navigate] = useLocation();
  const vendor = user?.signupIntent === "vendor";
  const subtitle = !user ? "Enter the code we emailed you and choose a password."
    : vendor ? "Vendor step 1 of 3: verify your email, then your phone."
    : "Verify your email to finish signing up. No phone verification is required.";
  return <AuthCard title={user ? "Verify your account" : "Check your email"} subtitle={loading || error ? undefined : <p>{subtitle}</p>}>
    <div className="mt-6">
      {error ? <p role="alert" className={authError}>{error.message}</p> : loading ? <p className="text-center">Loading account...</p> : !user ? <>
        <PendingRegistration />
        <p className="mt-6 text-center text-sm">Already registered?{" "}<Link className={authLink} href={`/login?next=${encodeURIComponent(accountReturnPath())}`}>Sign in</Link></p>
      </> : <>
        <ContactVerification showPhone={vendor && Boolean(user.emailVerifiedAt)} />
        <button className={`${authPrimary} mt-6`} disabled={!user.emailVerifiedAt}
          onClick={() => navigate(vendor ? "/vendor/onboarding" : accountReturnPath())}>Continue</button>
        {!user.emailVerifiedAt && <EmailChangeForm />}
      </>}
    </div>
  </AuthCard>;
}