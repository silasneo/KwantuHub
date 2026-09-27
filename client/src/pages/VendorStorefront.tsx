import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function VendorStorefront() {
  const [, params] = useRoute("/vendors/:slug");
  const [, altParams] = useRoute("/storefronts/:slug");
  const slug = params?.slug || altParams?.slug || "";

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const {
    data: storefront,
    isLoading,
    error,
  } = trpc.marketplace.getStorefront.useQuery({ slug }, { enabled: !!slug });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-6xl mx-auto px-4 py-20 text-center font-serif text-xl">
          Loading vendor storefront...
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (error || !storefront) {
    return (
      <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-6xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-serif font-bold text-[#0a0a0a] mb-4">
            Vendor Storefront Not Found
          </h2>
          <Link
            href="/vendors"
            className="text-xs font-bold uppercase tracking-wider text-[#d71466]"
          >
            ← Return to Vendor Directory
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Vendor Header / Hero */}
        <section className="bg-[#0a0a0a] text-[#f0e8dc] py-16 px-4 sm:px-8 border-b border-[#222]">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div className="flex items-start gap-6">
              {storefront.logoUrl ? (
                <img
                  src={storefront.logoUrl}
                  alt={storefront.displayName}
                  className="w-24 h-24 rounded object-cover border-2 border-[#333]"
                />
              ) : (
                <div className="w-24 h-24 rounded brand-gradient flex items-center justify-center text-white font-serif font-bold text-3xl">
                  {storefront.displayName[0]}
                </div>
              )}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-green-950 text-green-300 border border-green-800 px-2.5 py-0.5 rounded">
                    ✓ Verified Diaspora Vendor
                  </span>
                  <span className="text-xs text-[#a8a199]">
                    📍 {storefront.location || "North America"}
                  </span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-serif font-bold text-white mb-2">
                  {storefront.displayName}
                </h1>
                {storefront.headline && (
                  <p className="text-base text-[#d1c8bd] font-serif italic max-w-2xl">
                    "{storefront.headline}"
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/vendors"
                className="text-xs font-bold uppercase tracking-wider border border-[#555] text-[#d1c8bd] px-4 py-2.5 rounded hover:bg-[#222] transition"
              >
                ← All Vendors
              </Link>
            </div>
          </div>
        </section>

        {/* Vendor Bio and Offerings */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
          {storefront.description && (
            <div className="bg-white border border-[#d9d0c4] p-8 rounded mb-12 shadow-xs">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#d71466] mb-3">
                ABOUT THE VENDOR & CRAFT
              </h3>
              <p className="font-serif text-lg text-[#333] leading-relaxed">
                {storefront.description}
              </p>
            </div>
          )}

          {/* Section Toolbar */}
          <div className="flex justify-between items-center mb-8 border-b border-[#d9d0c4] pb-4">
            <div>
              <h2 className="text-2xl sm:text-4xl font-serif font-bold text-[#0a0a0a]">
                Creations & <span className="italic font-normal">Services</span>
              </h2>
              <span className="text-xs text-[#68635c]">
                {storefront.listings.length} verified offerings
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#68635c] mr-2">View:</span>
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 py-1.5 text-xs font-bold uppercase rounded border transition ${
                  viewMode === "grid"
                    ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                    : "bg-white text-[#0a0a0a] border-[#d9d0c4]"
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 text-xs font-bold uppercase rounded border transition ${
                  viewMode === "list"
                    ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                    : "bg-white text-[#0a0a0a] border-[#d9d0c4]"
                }`}
              >
                List
              </button>
            </div>
          </div>

          {storefront.listings.length === 0 ? (
            <div className="bg-white border border-[#d9d0c4] p-12 rounded text-center text-[#68635c] font-serif">
              This vendor has no published offerings at the moment. Check back
              soon!
            </div>
          ) : viewMode === "grid" ? (
            /* Masonry-style Grid */
            <div className="columns-1 sm:columns-2 md:columns-3 gap-6">
              {storefront.listings.map((item: any) => (
                <Link
                  key={item.id}
                  href={`/listings/${item.slug}`}
                  className="group inline-block w-full mb-6 break-inside-avoid bg-white border border-[#d9d0c4] rounded overflow-hidden shadow-xs hover:border-[#d71466] hover:shadow-md transition"
                >
                  <div className="h-48 bg-[#0a0a0a] relative overflow-hidden">
                    {item.media?.[0]?.url ? (
                      <img
                        src={item.media[0].url}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    ) : (
                      <div className="w-full h-full brand-gradient opacity-90 flex items-center justify-center p-6 text-center">
                        <span className="font-serif text-white font-bold text-xl">
                          {item.title}
                        </span>
                      </div>
                    )}
                    <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider bg-white/95 text-[#0a0a0a] px-2.5 py-1 rounded">
                      {item.listingType}
                    </span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-serif font-bold text-xl text-[#0a0a0a] group-hover:text-[#d71466] transition mb-2">
                        {item.title}
                      </h3>
                      <p className="text-sm text-[#68635c] line-clamp-2 mb-4 font-serif">
                        {item.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#eee8df] flex justify-between items-center text-xs">
                      <span className="font-bold text-[#0a0a0a] text-sm font-serif">
                        {item.priceIndication || "Inquire"}
                      </span>
                      <span className="text-[#d71466] font-semibold">
                        View details →
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="space-y-4">
              {storefront.listings.map((item: any) => (
                <Link
                  key={item.id}
                  href={`/listings/${item.slug}`}
                  className="group bg-white border border-[#d9d0c4] rounded p-5 shadow-xs hover:border-[#d71466] transition flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between"
                >
                  <div className="flex gap-5 items-center">
                    <div className="w-24 h-24 rounded bg-[#0a0a0a] overflow-hidden shrink-0">
                      {item.media?.[0]?.url ? (
                        <img
                          src={item.media[0].url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full brand-gradient" />
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#d71466] block mb-1">
                        {item.listingType}
                      </span>
                      <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] group-hover:text-[#d71466] transition">
                        {item.title}
                      </h3>
                      <p className="text-sm text-[#68635c] font-serif line-clamp-1 mt-1">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-0 border-[#eee8df]">
                    <span className="font-bold font-serif text-lg text-[#0a0a0a]">
                      {item.priceIndication || "Inquire"}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#d71466] sm:mt-2">
                      Inquire →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
