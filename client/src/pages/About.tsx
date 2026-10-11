import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-8 py-16">
        <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] block mb-3">
          OUR MISSION & IDENTITY
        </span>
        <h1 className="text-4xl sm:text-6xl font-serif font-bold text-[#0a0a0a] mb-8 leading-[1.05]">
          Where cultural heritage meets{" "}
          <span className="italic font-normal">modern diaspora trade.</span>
        </h1>

        <div className="prose prose-lg font-serif text-[#333] leading-relaxed space-y-6 text-lg">
          <p>
            KwantuHub was founded with a single uncompromising premise: the
            African diaspora across North America deserves a dedicated,
            culturally grounded marketplace where artisans, food producers,
            language tutors, and creators can connect directly with community.
          </p>

          <div className="p-6 bg-white border border-[#d9d0c4] rounded my-8">
            <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-2">
              The Visual Identity
            </h3>
            <p className="text-sm font-sans text-[#68635c] leading-relaxed">
              Rooted in the ancient <b>Nsibidi ideographic system</b> and{" "}
              <b>Nok terracotta traditions</b>, KwantuHub balances contemporary
              editorial elegance with deep heritage. Our color palette honors
              Kohl Black (#0A0A0A) and Bone White (#F0E8DC), illuminated by a
              vibrant sunset gradient (#D71466 to #FE8129).
            </p>
          </div>

          <h2 className="text-2xl font-bold font-serif text-[#0a0a0a] pt-4">
            Why Lead Generation & Discovery First?
          </h2>
          <p>
            Instead of rushing into transactional fees or generic drop-shipping
            e-commerce, the KwantuHub MVP focuses on discovery, authentic vendor
            vetting, and direct buyer inquiries. When you inquire on KwantuHub,
            you speak directly with the vendor, tailor orders to your cultural
            celebrations, and support independent diaspora enterprise.
          </p>

          <h2 className="text-2xl font-bold font-serif text-[#0a0a0a] pt-4">
            Our Commitment
          </h2>
          <p>
            Every vendor profile on KwantuHub is manually reviewed by platform
            stewards to guarantee authenticity, respectful representation, and
            reliable delivery across the United States and Canada.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
