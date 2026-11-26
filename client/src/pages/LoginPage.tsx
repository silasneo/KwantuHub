import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import TurnstileField, { turnstileConfigured } from "@/components/TurnstileField";
import { AuthCard, authField, authLabel, authLink } from "@/components/AuthCard";

export function accountReturnPath() {
  const next = new URLSearchParams(window.location.search).get("next") || "/account";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") && !/^\/(?:login|reset-password|verify-account)(?:[/?#]|$)/.test(next)
    ? next : "/account";
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "register" | "forgot">(
    new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"buyer" | "vendor">(
    new URLSearchParams(window.location.search).get("role") === "vendor" ? "vendor" : "buyer");
  const [terms, setTerms] = useState(false);
  const [token, setToken] = useState<string>();
  const [challengeKey, setChallengeKey] = useState(0);
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const pending = trpc.auth.registrationStatus.useQuery();
  const renew = () => { setToken(undefined); setChallengeKey(key => key + 1); };
  const login = trpc.auth.login.useMutation({
    onSuccess: data => {
      utils.auth.me.setData(undefined, data.user);
      utils.auth.me.invalidate();
      const next = accountReturnPath();
      if (!data.user.emailVerifiedAt) navigate(`/verify-account?next=${encodeURIComponent(next)}`);
      else if (data.user.role === "admin") navigate("/admin");
      else if (data.user.signupIntent === "vendor" && data.user.role !== "vendor") navigate("/vendor/onboarding");
      else navigate(next !== "/account" ? next : data.user.role === "vendor" ? "/vendor" : "/account");
    },
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      utils.auth.registrationStatus.invalidate();
      const next = role === "vendor" ? "/vendor/onboarding" : accountReturnPath();
      navigate(`/verify-account?next=${encodeURIComponent(next)}`);
    },
    onSettled: renew,
  });
  const forgot = trpc.auth.requestPasswordReset.useMutation({ onSettled: renew });
  const busy = login.isPending || register.isPending || forgot.isPending;
  const failure = error || login.error?.message || register.error?.message || forgot.error?.message;
  const fieldClass = authField;
  const labelClass = authLabel;
  const linkClass = authLink;
  const switchMode = (value: "login" | "register" | "forgot") => {
    setMode(value); setError(""); login.reset(); register.reset(); forgot.reset(); renew();
  };
  return <AuthCard
    title={mode === "login" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Join KwantuHub"}
    subtitle={<p>
      {mode === "login" && <>New to KwantuHub?{" "}<button type="button" className={linkClass} onClick={() => switchMode("register")}>Create an account</button></>}
      {mode === "register" && <>Already have an account?{" "}<button type="button" className={linkClass} onClick={() => switchMode("login")}>Sign in</button></>}
      {mode === "forgot" && <>We'll email you a secure reset link.</>}
    </p>}>
        <div className="mt-6 space-y-3 text-center text-sm">
          {failure && <p role="alert" className="form-error !mt-0 rounded-xl bg-[#fdecec] px-4 py-3">{failure}</p>}
          {forgot.data && <p role="status" className="rounded-xl bg-[#eef6ee] px-4 py-3">{forgot.data.message}</p>}
          {new URLSearchParams(window.location.search).get("passwordChanged") === "1" && <p role="status" className="rounded-xl bg-[#eef6ee] px-4 py-3">Your password was updated. Sign in again.</p>}
        </div>
        <form className="mt-2 space-y-5" onSubmit={event => {
          event.preventDefault(); setError("");
          if (busy || (mode !== "login" && turnstileConfigured && !token)) return;
          if (mode === "login") login.mutate({ email, password });
          else if (mode === "forgot") forgot.mutate({ email, turnstileToken: token });
          else {
            if (!terms) { setError("Accept the Terms and Privacy Policy to continue."); return; }
            register.mutate({ firstName, lastName, email, role, termsAccepted: true, turnstileToken: token });
          }
        }}>
          {mode === "register" && <>
            <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-1 rounded-full bg-[#f0e8dc] p-1">
              {(["buyer", "vendor"] as const).map(value =>
                <button type="button" role="radio" aria-checked={role === value} key={value} onClick={() => setRole(value)}
                  className={`rounded-full py-2.5 text-sm font-semibold transition ${role === value ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#4b4843] hover:text-[#0a0a0a]"}`}>
                  {value === "buyer" ? "I'm buying" : "I'm a vendor"}
                </button>)}
            </div>
            {role === "buyer" && <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>First name<input autoComplete="given-name" required maxLength={100} className={fieldClass} value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
              <label className={labelClass}>Last name<input autoComplete="family-name" required maxLength={100} className={fieldClass} value={lastName} onChange={event => setLastName(event.target.value)} /></label>
            </div>}
            {role === "vendor" && <p className="rounded-xl bg-[#faf6f0] px-4 py-3 text-sm text-[#4b4843]">Step 1 of 3: account and contact verification. Your vendor status activates only after personal identity verification and storefront setup.</p>}
          </>}
          <label className={labelClass}>Email address<input type="email" autoComplete="email" required className={fieldClass} value={email} onChange={event => setEmail(event.target.value)} /></label>
          {mode === "login" && <label className={labelClass}>Password<input type="password" autoComplete="current-password" required className={fieldClass} value={password} onChange={event => setPassword(event.target.value)} /></label>}
          {mode === "register" && <>
            <p className="text-sm text-[#4b4843]">You'll verify your email and choose a password next. Pending registrations expire after 24 hours.</p>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#0a0a0a]" checked={terms} onChange={event => setTerms(event.target.checked)} /><span>I accept the <Link href="/terms" className="underline underline-offset-2">Terms</Link> and <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.</span></label>
          </>}
          {mode !== "login" && <div className="flex flex-col items-center"><TurnstileField key={`${mode}-${challengeKey}`} action={mode === "forgot" ? "password_reset" : "register"} onToken={setToken} /></div>}
          <button disabled={busy || (mode !== "login" && turnstileConfigured && !token)} className="brand-button w-full !rounded-full !py-4 !text-sm" type="submit">{busy ? "Please wait..." : mode === "login" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Continue to verification"}</button>
        </form>
        <div className="mt-6 space-y-3 text-center text-sm">
          {mode === "login" && <button type="button" className={linkClass} onClick={() => switchMode("forgot")}>Forgot password?</button>}
          {mode === "forgot" && <button type="button" className={linkClass} onClick={() => switchMode("login")}>Back to sign in</button>}
          {pending.data && <Link className={`block ${linkClass}`} href={`/verify-account?next=${encodeURIComponent(accountReturnPath())}`}>Resume email verification for {pending.data.email}</Link>}
          {pending.error && <p role="alert" className="form-error">{pending.error.message}</p>}
        </div>
  </AuthCard>;
}
