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
            Vendor direct contact channels (phone, WhatsApp, iMessage) are shielded and never published in raw HTML. Contact channels are only revealed to authenticated buyers who complete human bot verification.
          </p>
          <h2 className="font-bold text-xl text-[#0a0a0a]">3. Identity & Residence Verification</h2>
          <p>
            Evidence submitted for vendor identity and North America residence verification (such as business licenses or utility statements) is encrypted, strictly restricted to authorized administrators, and never displayed publicly.
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
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
