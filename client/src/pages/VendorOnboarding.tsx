import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function VendorOnboarding() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [description, setDescription] = useState("");
  const [locationStr, setLocationStr] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");

  const saveProfile = trpc.vendor.saveProfile.useMutation({
    onSuccess: () => {
      setLocation("/vendor");
    },
  });

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-16 w-full">
        <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] block mb-2">
          JOIN THE COMMUNITY
        </span>
        <h1 className="text-4xl sm:text-5xl font-serif font-bold text-[#0a0a0a] mb-4">
          List your <span className="italic font-normal">business.</span>
        </h1>
        <p className="text-sm font-serif text-[#68635c] mb-8">
          Join North America’s premier discovery marketplace for African
          diaspora artisans, food purveyors, and cultural service providers.
        </p>

        {!isAuthenticated ? (
          <div className="bg-white border border-[#d9d0c4] p-8 rounded text-center">
            <h3 className="font-serif font-bold text-2xl mb-2 text-[#0a0a0a]">
              Authentication Required
            </h3>
            <p className="text-sm text-[#68635c] font-serif mb-6">
              Please sign in with your KwantuHub account to establish your
              vendor profile.
            </p>
            <a
              href="/login"
              className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-3 rounded inline-block"
            >
              Sign In to Continue
            </a>
          </div>
        ) : (
          <div className="bg-white border border-[#d9d0c4] p-8 rounded shadow-xs space-y-5">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Business / Brand Name *
              </label>
              <input
                type="text"
                required
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Aunty Eki's Ankara"
                className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Location (City, State/Province) *
              </label>
              <input
                type="text"
                required
                value={locationStr}
                onChange={e => setLocationStr(e.target.value)}
                placeholder="e.g. Houston, TX or Toronto, ON"
                className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Service Area / Shipping Regions
              </label>
              <input
                type="text"
                value={serviceArea}
                onChange={e => setServiceArea(e.target.value)}
                placeholder="e.g. Continental US, Nationwide Canada, or Greater Chicago"
                className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remote"
                checked={remoteAvailable}
                onChange={e => setRemoteAvailable(e.target.checked)}
                className="h-4 w-4"
              />
              <label
                htmlFor="remote"
                className="text-xs font-semibold text-[#0a0a0a]"
              >
                We offer virtual or remote services (consultations, language
                lessons, custom orders)
              </label>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                About Your Creations / Story *
              </label>
              <textarea
                rows={4}
                required
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Share your heritage, craft techniques, sourcing, and what you create..."
                className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="orders@yourbusiness.com"
                  className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                  Website / Social Link
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (!businessName || !description) return;
                saveProfile.mutate({
                  businessName,
                  description,
                  location: locationStr,
                  serviceArea,
                  remoteAvailable,
                  contactEmail: contactEmail || undefined,
                  website: website || undefined,
                });
              }}
              disabled={saveProfile.isPending || !businessName || !description}
              className="w-full text-xs font-bold uppercase tracking-wider text-white brand-gradient py-3.5 rounded hover:opacity-95 transition disabled:opacity-50 cursor-pointer"
            >
              {saveProfile.isPending
                ? "Submitting Application..."
                : "Submit Vendor Application"}
            </button>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
