import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"buyer" | "vendor">("buyer");
  const [errorMsg, setErrorMsg] = useState("");

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: data => {
      utils.auth.me.setData(undefined, data.user as any);
      utils.auth.me.invalidate();
      if (data.user.role === "admin") {
        setLocation("/admin");
      } else if (data.user.role === "vendor") {
        setLocation("/vendor");
      } else {
        setLocation("/account");
      }
    },
    onError: err => {
      setErrorMsg(
        err.message || "Failed to sign in. Please verify your credentials."
      );
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: data => {
      utils.auth.me.setData(undefined, data.user as any);
      utils.auth.me.invalidate();
      if (data.user.role === "vendor") {
        setLocation("/vendor/onboarding");
      } else {
        setLocation("/marketplace");
      }
    },
    onError: err => {
      setErrorMsg(err.message || "Failed to register. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else {
      registerMutation.mutate({ name, email, password, role });
    }
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("DemoPass123!");
    setMode("login");
  };

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="bg-white border border-[#d9d0c4] p-8 sm:p-10 rounded max-w-md w-full shadow-xs">
          <div className="text-center mb-8">
            <img
              src="/manus-storage/Kwantu-identity_fc192da7.svg"
              alt="KwantuHub"
              className="h-10 w-auto mx-auto mb-4 object-contain"
            />
            <h2 className="text-3xl font-serif font-bold text-[#0a0a0a]">
              {mode === "login" ? "Sign in to KwantuHub" : "Join the Community"}
            </h2>
            <p className="text-xs text-[#68635c] font-serif mt-1">
              Scoped JWT Authentication per approved SOW
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex border-b border-[#d9d0c4] mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg("");
              }}
              className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
                mode === "login"
                  ? "border-[#d71466] text-[#d71466]"
                  : "border-transparent text-[#68635c]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setErrorMsg("");
              }}
              className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
                mode === "register"
                  ? "border-[#d71466] text-[#d71466]"
                  : "border-transparent text-[#68635c]"
              }`}
            >
              Register
            </button>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded text-xs mb-5">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Stephen Georgewill"
                    className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                    Account Role *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("buyer")}
                      className={`py-2 text-xs font-bold uppercase rounded border transition cursor-pointer ${
                        role === "buyer"
                          ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                          : "bg-white text-[#0a0a0a] border-[#d9d0c4]"
                      }`}
                    >
                      Buyer / Patron
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("vendor")}
                      className={`py-2 text-xs font-bold uppercase rounded border transition cursor-pointer ${
                        role === "vendor"
                          ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                          : "bg-white text-[#0a0a0a] border-[#d9d0c4]"
                      }`}
                    >
                      Vendor
                    </button>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Password *
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending || registerMutation.isPending}
              className="w-full text-xs font-bold uppercase tracking-wider text-white brand-gradient py-3.5 rounded hover:opacity-95 transition disabled:opacity-50 cursor-pointer mt-2"
            >
              {loginMutation.isPending || registerMutation.isPending
                ? "Authenticating..."
                : mode === "login"
                  ? "Sign In with JWT"
                  : "Create Account & Sign In"}
            </button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-8 pt-6 border-t border-[#eee8df] text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#888] block mb-2">
              Quick Test Accounts (Password: DemoPass123!)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fillDemo("admin@kwantuhub.local")}
                className="px-2.5 py-1 bg-[#faf6f0] border border-[#d9d0c4] rounded text-[11px] font-semibold text-[#0a0a0a] hover:bg-[#eae2d5] cursor-pointer"
              >
                Platform Admin
              </button>
              <button
                type="button"
                onClick={() => fillDemo("demo.vendor.eki@kwantuhub.local")}
                className="px-2.5 py-1 bg-[#faf6f0] border border-[#d9d0c4] rounded text-[11px] font-semibold text-[#0a0a0a] hover:bg-[#eae2d5] cursor-pointer"
              >
                Aunty Eki (Vendor)
              </button>
              <button
                type="button"
                onClick={() => fillDemo("demo.buyer@kwantuhub.local")}
                className="px-2.5 py-1 bg-[#faf6f0] border border-[#d9d0c4] rounded text-[11px] font-semibold text-[#0a0a0a] hover:bg-[#eae2d5] cursor-pointer"
              >
                Chioma (Buyer)
              </button>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
