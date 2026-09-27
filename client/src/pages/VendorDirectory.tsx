import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function VendorDirectory() {
  const { data: vendors, isLoading } = trpc.vendors.list.useQuery();

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-8 py-12 w-full">
        {/* Header */}
        <div className="mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] block mb-2">
            03 — FROM THE COMMUNITY
          </span>
          <h1 className="text-4xl sm:text-6xl font-serif font-bold text-[#0a0a0a]">
            Meet the <span className="italic font-normal">vendors.</span>
          </h1>
          <p className="text-[#68635c] font-serif text-lg mt-2 max-w-2xl">
            Verified diaspora artisans, textile creators, food purveyors, and
            cultural educators across North America.
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-[#68635c] font-serif text-lg">
            Loading diaspora creators...
          </div>
        ) : (vendors?.length || 0) === 0 ? (
          <div className="bg-white border border-[#d9d0c4] p-12 rounded text-center">
            <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-2">
              No vendors listed yet
            </h3>
            <p className="text-[#68635c] font-serif mb-6">
              Vendors are currently completing onboarding review.
            </p>
            <Link
              href="/vendor/onboarding"
              className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-3 rounded"
            >
              List Your Business
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            {vendors?.map(v => {
              const sfSlug =
                v.storefront?.slug ||
                v.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
              return (
                <Link
                  key={v.id}
                  href={`/vendors/${sfSlug}`}
                  className="group bg-white border border-[#d9d0c4] rounded overflow-hidden shadow-xs hover:border-[#d71466] hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    {/* Media preview */}
                    <div className="h-48 bg-[#0a0a0a] relative overflow-hidden">
                      {v.storefront?.coverUrl || v.storefront?.logoUrl ? (
                        <img
                          src={
                            v.storefront?.coverUrl ||
                            v.storefront?.logoUrl ||
                            ""
                          }
                          alt={v.businessName}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                      ) : (
                        <div className="w-full h-full brand-gradient opacity-90 flex items-center justify-center p-6 text-center">
                          <span className="font-serif text-white font-bold text-2xl">
                            {v.businessName}
                          </span>
                        </div>
                      )}
                      <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider bg-white/95 text-green-800 px-2.5 py-1 rounded">
                        ✓ Verified vendor
                      </span>
                    </div>

                    <div className="p-6">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#d71466] block mb-1">
                        {v.location || "North America"}
                      </span>
                      <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] group-hover:text-[#d71466] transition mb-2">
                        {v.businessName}
                      </h3>
                      {v.storefront?.headline && (
                        <p className="text-xs text-[#68635c] font-serif italic mb-3">
                          "{v.storefront.headline}"
                        </p>
                      )}
                      <p className="text-sm text-[#333] font-serif line-clamp-3 leading-relaxed mb-4">
                        {v.description}
                      </p>
                    </div>
                  </div>

                  <div className="p-6 pt-0 border-t border-[#eee8df] mt-4 flex justify-between items-center text-xs">
                    <span className="text-[#68635c] font-semibold">
                      {v.listingCount}{" "}
                      {v.listingCount === 1 ? "offering" : "offerings"}
                    </span>
                    <span className="font-bold uppercase tracking-wider text-[#d71466] group-hover:translate-x-1 transition">
                      View Storefront →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
