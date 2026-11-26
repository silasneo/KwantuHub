import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export function VerifiedAccountGate({ children }: { children: ReactNode }) {
  const { user, loading, error } = useAuth();
  const registration = trpc.auth.registrationStatus.useQuery(undefined, { enabled: !loading && !user, retry: false });
  if (loading || (!user && registration.isLoading)) return <p className="p-8">Loading account...</p>;
  if (error || (!user && registration.error)) return <p role="alert" className="p-8">Could not load your account. Please retry.</p>;
  if ((user && !user.emailVerifiedAt) || (!user && registration.data)) {
    return <Redirect to={`/verify-account?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} />;
  }
  return children;
}
