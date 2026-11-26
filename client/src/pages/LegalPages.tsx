import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-16 space-y-6">
        <h1 className="font-serif font-bold text-4xl text-[#0a0a0a]">Privacy Policy</h1>
        <p className="text-xs uppercase tracking-widest text-[#d71466] font-bold">Effective Date: October 2026</p>
        <div className="bg-white border border-[#d9d0c4] p-8 rounded space-y-4 font-serif text-[#333] leading-relaxed text-sm">
          <p>
            KwantuHub connects African diaspora artisans, service providers, and buyers across North America. We respect your privacy and protect personal data collected through our platform.
          </p>
          <h2 className="font-bold text-xl text-[#0a0a0a]">1. Information We Collect</h2>
          <p>
            We collect account credentials (email address, hashed password), contact information (phone number for verified communications), and business profile information submitted by vendors.
          </p>
          <h2 className="font-bold text-xl text-[#0a0a0a]">2. How We Protect Vendor Contacts</h2>
          <p>
            Vendors choose which business contact channels to share publicly. Visitors may view those channels without an account. Sending an inquiry through KwantuHub requires an account with a verified email. Buyer signup does not require phone or identity verification.
          </p>
          <h2 className="font-bold text-xl text-[#0a0a0a]">3. Identity & Residence Verification</h2>
          <p>
            Vendor onboarding requires verified email and a US, Canadian or Mexican phone number, personal details and adult identity verification through Didit. Date of birth and address submitted during onboarding are encrypted in the application database and are not public profile fields. Private verification evidence is restricted to authorized access and is never displayed publicly. Infrastructure encryption and retention depend on the deployment configuration.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-16 space-y-6">
        <h1 className="font-serif font-bold text-4xl text-[#0a0a0a]">Terms of Service</h1>
        <p className="text-xs uppercase tracking-widest text-[#d71466] font-bold">Effective Date: October 2026</p>
        <div className="bg-white border border-[#d9d0c4] p-8 rounded space-y-4 font-serif text-[#333] leading-relaxed text-sm">
          <p>
            Welcome to KwantuHub. By accessing or using our marketplace platform, you agree to comply with these terms.
          </p>
          <h2 className="font-bold text-xl text-[#0a0a0a]">1. Marketplace Model</h2>
          <p>
            KwantuHub provides a discovery and lead-generation directory connecting buyers and African diaspora vendors. All transactions, agreements, and deliverables are arranged directly between buyers and vendors.
          </p>
          <h2 className="font-bold text-xl text-[#0a0a0a]">2. Vendor Standards</h2>
          <p>
            Vendors must represent authentic offerings, maintain respectful community communication, and provide accurate location and contact channels. Prohibited items and misrepresentations result in immediate listing removal and account suspension.
          </p>
          <p>
            Vendors must be at least 18, verify email and a supported US, Canadian or Mexican phone number, and complete Didit identity verification and storefront setup. Completing onboarding activates the vendor without manual application approval. Administrators may suspend or re-enable vendors; re-enablement does not bypass verification requirements.
          </p>
          <h2 className="font-bold text-xl text-[#0a0a0a]">3. Buyer Accounts and Reviews</h2>
          <p>
            Buyers may browse listings and view vendor-selected public contacts without signing up. An email-verified account is required to send inquiries. Reviews require a signed-in, email-verified buyer who previously sent an inquiry to the vendor; a purchase is not required. Self-reviews and misleading reviews are prohibited.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
