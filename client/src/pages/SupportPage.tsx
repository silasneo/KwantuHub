import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-16 space-y-6">
        <h1 className="font-serif font-bold text-4xl text-[#0a0a0a]">Community Support & Help Center</h1>
        <p className="text-xs uppercase tracking-widest text-[#d71466] font-bold">KwantuHub Trust & Safety</p>
        <div className="bg-white border border-[#d9d0c4] p-8 rounded space-y-6 font-serif text-[#333] leading-relaxed text-sm">
          <div>
            <h2 className="font-bold text-xl text-[#0a0a0a] mb-2">How KwantuHub Works</h2>
            <p>
              KwantuHub connects diaspora buyers directly with verified vendors across North America. To ask questions about custom sizes, materials, or shipping arrangements, use the <strong>Inquire</strong> button on any listing page.
            </p>
          </div>
          <div className="border-t border-[#eee8df] pt-4">
            <h2 className="font-bold text-xl text-[#0a0a0a] mb-2">Reporting an Issue or Conversation</h2>
            <p>
              If you experience inappropriate communication, misrepresentation, or unresponsive behavior:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Open your <strong>Buyer Account</strong> or <strong>Vendor Portal</strong>.</li>
              <li>Locate the relevant conversation under <strong>Inquiries</strong>.</li>
              <li>Click <strong>Report Conversation</strong> to submit the case directly to the administrator moderation queue.</li>
            </ul>
          </div>
          <div className="border-t border-[#eee8df] pt-4">
            <h2 className="font-bold text-xl text-[#0a0a0a] mb-2">General Inquiries & Platform Assistance</h2>
            <p>
              For platform bugs, vendor verification questions, or governance inquiries, email our support team at <a href="mailto:support@kwantuhub.com" className="text-[#d71466] underline">support@kwantuhub.com</a>.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
