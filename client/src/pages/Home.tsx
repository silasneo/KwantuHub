import { useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

const heroSlides = [
  {
    id: "01",
    label: "The marketplace introduction",
    eyebrow: "KWANTUHUB: THE AFRICAN DIASPORA MARKETPLACE",
    headline: "Where the diaspora",
    emphasis: "finds home.",
    description:
      "Fabrics, food, language tutors, and wedding services from verified diaspora creators across North America.",
    primaryLabel: "Explore Marketplace",
    primaryHref: "/marketplace",
    secondaryLabel: "List Your Business",
    secondaryHref: "/vendor/onboarding",
    note: "Meet the people behind the work before you make an inquiry.",
    image: "/manus-storage/kwantu-hero-fashion-maker_20399257_99e7dc6b.jpg",
    alt: "Diaspora textile vendor arranging a hand-dyed textile",
  },
  {
    id: "02",
    label: "Featured vendor spotlight",
    eyebrow: "VENDOR'S NOTE — VERIFIED VENDOR",
    headline: "Meet the hands",
    emphasis: "behind the heirloom.",
    description:
      "Aunty Eki’s Ankara brings hand-selected textiles, thoughtful styling, and the energy of a familiar market stall to Houston and beyond.",
    primaryLabel: "Explore Aunty Eki’s archive",
    primaryHref: "/vendors/aunty-eki-s-ankara",
    secondaryLabel: "Meet more vendors",
    secondaryHref: "/vendors",
    note: "One storefront, a lifetime of pattern, ceremony, and memory.",
    image: "/manus-storage/kwantu-ceremony-tailor_6da99e5d_14bae697.jpg",
    alt: "Tailor preparing a garment for a family celebration",
  },
  {
    id: "03",
    label: "Cultural language and heritage",
    eyebrow: "HERITAGE CONNECTION — LIVE TUTORING",
    headline: "Language is a",
    emphasis: "living address.",
    description:
      "Gentle, family-centred Yorùbá sessions, conversational circles, and tutors who keep the sounds of home alive across time zones.",
    primaryLabel: "Browse Language Offerings",
    primaryHref: "/marketplace?category=education-learning",
    secondaryLabel: "Explore All Services",
    secondaryHref: "/marketplace?type=service",
    note: "Small group circles and one-on-one immersion classes.",
    image: "/manus-storage/kwantu-tutor-family_96516297_e66523e7.jpg",
    alt: "Family enjoying language storytelling session together",
  },
];

export default function Home() {
  const [activeSlide, setActiveSlide] = useState(0);

  // Auto-advance hero slides every 7 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % heroSlides.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const slide = heroSlides[activeSlide];

  const { data: categories } = trpc.categories.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero Slider Section matching Prototype */}
        <section className="bg-[#0a0a0a] text-[#f0e8dc] relative overflow-hidden border-b border-[#222]">
          {/* Background image container with cross-fade */}
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-1000 opacity-25 filter grayscale-[30%]"
            style={{ backgroundImage: `url(${slide.image})` }}
          />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-28 z-10">
            <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] mb-4 block">
              {slide.eyebrow}
            </span>

            <h1 className="text-5xl sm:text-7xl md:text-8xl font-serif font-bold tracking-tight leading-[0.95] max-w-4xl text-white mb-6">
              {slide.headline}{" "}
              <span className="italic font-normal">{slide.emphasis}</span>
            </h1>

            <p className="text-lg sm:text-xl text-[#d1c8bd] max-w-2xl font-serif leading-relaxed mb-10">
              {slide.description}
            </p>

            <div className="flex flex-wrap gap-4 items-center">
              <Link
                href={slide.primaryHref}
                className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-7 py-3.5 rounded hover:opacity-95 transition"
              >
                {slide.primaryLabel} →
              </Link>
              <Link
                href={slide.secondaryHref}
                className="text-xs font-bold uppercase tracking-wider text-[#0a0a0a] bg-white px-7 py-3.5 rounded hover:bg-[#eae2d5] transition"
              >
                {slide.secondaryLabel}
              </Link>
            </div>

            {/* Slider Controls */}
            <div className="mt-16 pt-8 border-t border-[#222] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-white font-mono">
                  {slide.id}
                </span>
                <span className="text-[#888]">{slide.label}</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setActiveSlide(
                      prev => (prev - 1 + heroSlides.length) % heroSlides.length
                    )
                  }
                  className="w-8 h-8 rounded-full border border-[#444] text-white flex items-center justify-center hover:bg-[#222] transition cursor-pointer"
                  aria-label="Previous slide"
                >
                  ‹
                </button>
                <div className="flex gap-2">
                  {heroSlides.map((s, idx) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSlide(idx)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        activeSlide === idx
                          ? "w-8 bg-[#d71466]"
                          : "w-2 bg-[#444]"
                      }`}
                      aria-label={`Go to slide ${s.id}`}
                    />
                  ))}
                </div>
                <button
                  onClick={() =>
                    setActiveSlide(prev => (prev + 1) % heroSlides.length)
                  }
                  className="w-8 h-8 rounded-full border border-[#444] text-white flex items-center justify-center hover:bg-[#222] transition cursor-pointer"
                  aria-label="Next slide"
                >
                  ›
                </button>
              </div>
            </div>

            {/* Four Trust Pillars */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12 pt-8 border-t border-[#222] text-xs">
              <div>
                <b className="text-white block text-sm font-serif">
                  Verified Diaspora Vendors
                </b>
                <span className="text-[#888]">
                  Built around real people and storefronts
                </span>
              </div>
              <div>
                <b className="text-white block text-sm font-serif">
                  US, CA & MX Coverage
                </b>
                <span className="text-[#888]">
                  Find community across North America
                </span>
              </div>
              <div>
                <b className="text-white block text-sm font-serif">
                  Direct Community Inquiries
                </b>
                <span className="text-[#888]">
                  Start a conversation before you commit
                </span>
              </div>
              <div>
                <b className="text-white block text-sm font-serif">
                  Discovery with Dignity
                </b>
                <span className="text-[#888]">
                  A platform that puts people before clicks
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 02 — Cultural Aisles */}
        <section className="py-20 px-4 sm:px-8 max-w-6xl mx-auto">
          <div className="mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] block mb-2">
              02 — CULTURAL AISLES
            </span>
            <h2 className="text-3xl sm:text-5xl font-serif font-bold text-[#0a0a0a]">
              Shop by <span className="italic font-normal">category.</span>
            </h2>
            <p className="text-[#68635c] font-serif text-lg mt-1">
              From hand-dyed adire and specialty spices to Yorùbá tutors and
              bridal braiders.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {(categories || []).slice(0, 6).map(cat => (
              <Link
                key={cat.id}
                href={`/marketplace?category=${cat.slug}`}
                className="group bg-white p-6 border border-[#d9d0c4] rounded shadow-xs hover:border-[#d71466] transition flex flex-col justify-between h-48"
              >
                <div className="w-full h-24 rounded brand-gradient opacity-90 group-hover:opacity-100 transition" />
                <div className="mt-4">
                  <h3 className="font-serif font-bold text-xl text-[#0a0a0a] group-hover:text-[#d71466] transition">
                    {cat.name}
                  </h3>
                  <span className="text-xs text-[#68635c] uppercase tracking-wider font-semibold">
                    Enter aisle →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 03 — Meet the Vendors (Prototype Section) */}
        <section className="py-20 bg-[#eae2d5] border-y border-[#d9d0c4] px-4 sm:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-end mb-12">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#fe8129] block mb-2">
                  03 — FROM THE COMMUNITY
                </span>
                <h2 className="text-3xl sm:text-5xl font-serif font-bold text-[#0a0a0a]">
                  Meet the <span className="italic font-normal">vendors.</span>
                </h2>
              </div>
              <Link
                href="/vendors"
                className="text-xs font-bold uppercase tracking-wider text-[#d71466] hover:underline"
              >
                View all vendors →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {(vendors || []).slice(0, 4).map(v => {
                const sfSlug =
                  v.storefront?.slug ||
                  v.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                return (
                  <Link
                    key={v.id}
                    href={`/vendors/${sfSlug}`}
                    className="group bg-white border border-[#d9d0c4] rounded overflow-hidden shadow-xs hover:border-[#d71466] hover:shadow-md transition flex flex-col"
                  >
                    <div className="h-44 bg-[#0a0a0a] relative overflow-hidden">
                      {v.storefront?.coverUrl || v.storefront?.logoUrl ? (
                        <img
                          src={
                            v.storefront.coverUrl || v.storefront.logoUrl || ""
                          }
                          alt={v.businessName}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                      ) : (
                        <div className="w-full h-full brand-gradient opacity-90 flex items-center justify-center p-4 text-center">
                          <span className="font-serif text-white font-bold text-lg">
                            {v.businessName}
                          </span>
                        </div>
                      )}
                      <span className="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-wider bg-white/95 text-green-800 px-2 py-0.5 rounded">
                        ✓ Verified vendor
                      </span>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-serif font-bold text-xl text-[#0a0a0a] group-hover:text-[#d71466] transition mb-1">
                          {v.businessName}
                        </h4>
                        <span className="text-xs text-[#68635c] block mb-2">
                          ⌖ {v.location}
                        </span>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#d71466] pt-2 border-t border-[#eee8df] block">
                        View storefront →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* 04 — Why KwantuHub Story Section from Prototype */}
        <section className="py-20 px-4 sm:px-8 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="rounded overflow-hidden shadow-md h-96">
            <img
              src="/manus-storage/kwantu-wellness-tea_06aa39c7_ad80b8bd.jpg"
              alt="Diaspora herbal tea and handmade tableware"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] block mb-3">
              04 — WHY KWANTUHUB
            </span>
            <blockquote className="font-serif text-3xl sm:text-4xl text-[#0a0a0a] font-bold leading-tight mb-6">
              “We built KwantuHub because finding home shouldn’t require a
              six-hour flight.”
            </blockquote>
            <p className="text-xs text-[#68635c] uppercase tracking-wider font-semibold mb-6">
              Stephen Georgewill{" "}
              <span className="text-[#888]">· Co-Founder</span>
            </p>
            <Link
              href="/about"
              className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-3 rounded inline-block"
            >
              Read Our Story →
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
