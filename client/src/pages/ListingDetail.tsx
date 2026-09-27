import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { ListingImageCarousel } from "@/components/ListingImageCarousel";
import ContactReveal from "@/components/ContactReveal";

export default function ListingDetail() {
  const [, params] = useRoute("/listings/:slug");
  const slug = params?.slug || "";

  const { isAuthenticated } = useAuth();
  const [inquirySubject, setInquirySubject] = useState("");
  const [inquiryMsg, setInquiryMsg] = useState("");
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [submittedInquiry, setSubmittedInquiry] = useState(false);

  const utils = trpc.useUtils();
  const {
    data: item,
    isLoading,
    error,
  } = trpc.marketplace.getListing.useQuery({ slug }, { enabled: !!slug });

  // Fetch related listings based on category and listing ID
  const { data: relatedItems } = trpc.marketplace.getRelated.useQuery(
    {
      listingId: item?.id || 0,
      categoryId: item?.categoryId || 0,
      limit: 3,
    },
    { enabled: !!item?.id && !!item?.categoryId }
  );

  const createInquiryMutation = trpc.buyer.createInquiry.useMutation({
    onSuccess: () => {
      setSubmittedInquiry(true);
      setShowInquiryModal(false);
      utils.buyer.inquiries.invalidate();
    },
  });

  const toggleWishlistMutation = trpc.buyer.toggleWishlist.useMutation({
    onSuccess: () => {
      utils.buyer.wishlist.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-6xl mx-auto px-4 py-20 text-center font-serif text-2xl text-[#0a0a0a]">
          Loading creation details...
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-6xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-serif font-bold text-[#0a0a0a] mb-4">
            Listing not found
          </h2>
          <Link
            href="/marketplace"
            className="text-xs font-serif font-bold uppercase tracking-widest text-[#d71466]"
          >
            ← Return to Marketplace
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-8 py-12 w-full">
        {/* Breadcrumb */}
        <div className="mb-6 text-xs font-serif uppercase tracking-wider text-[#68635c] flex items-center gap-2">
          <Link href="/marketplace" className="hover:text-[#0a0a0a]">
            Marketplace
          </Link>
          <span>/</span>
          <Link
            href={`/marketplace?category=${item.category.slug}`}
            className="hover:text-[#0a0a0a]"
          >
            {item.category.name}
          </Link>
          <span>/</span>
          <span className="text-[#0a0a0a] font-bold">{item.title}</span>
        </div>

        {/* Primary Product Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14 bg-white border border-[#d9d0c4] p-6 sm:p-10 rounded shadow-xs mb-16">
          {/* Multi-Image Carousel (up to 5 images) */}
          <div>
            <ListingImageCarousel
              media={item.media}
              title={item.title}
              listingType={item.listingType}
            />
          </div>

          {/* Details & Inquire Actions */}
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-serif font-bold uppercase tracking-widest text-[#d71466]">
                  {item.category.name}
                </span>
                {isAuthenticated && (
                  <button
                    onClick={() =>
                      toggleWishlistMutation.mutate({ listingId: item.id })
                    }
                    className="text-xs font-serif font-bold uppercase tracking-wider text-[#68635c] hover:text-[#d71466] border border-[#d9d0c4] px-3 py-1.5 rounded transition cursor-pointer"
                  >
                    Save to Account
                  </button>
                )}
              </div>

              <h1 className="text-3xl sm:text-5xl font-serif font-bold text-[#0a0a0a] leading-tight mb-4">
                {item.title}
              </h1>

              <div className="text-2xl sm:text-3xl font-serif font-bold text-[#0a0a0a] mb-6">
                {item.priceIndication || "Inquire for pricing"}
              </div>

              {/* Vendor badge */}
              <div className="bg-[#faf6f0] border border-[#d9d0c4] p-4 rounded mb-8 flex justify-between items-center">
                <div>
                  <span className="text-[11px] font-serif font-bold uppercase tracking-wider text-[#68635c] block">
                    Verified Diaspora Vendor
                  </span>
                  <span className="text-base font-serif font-bold text-[#0a0a0a]">
                    {item.vendor.businessName}
                  </span>
                  <span className="text-xs font-serif text-[#68635c] block">
                    {item.location || "North America"}
                  </span>
                </div>
                {item.vendor.storefront && (
                  <Link
                    href={`/vendors/${item.vendor.storefront.slug}`}
                    className="text-xs font-serif font-bold uppercase tracking-wider text-[#d71466] hover:underline"
                  >
                    Visit Storefront →
                  </Link>
                )}
              </div>

              <div className="font-serif text-[#333] leading-relaxed mb-8">
                <h3 className="text-xs font-serif font-bold uppercase tracking-widest text-[#68635c] mb-2">
                  About this creation / service
                </h3>
                <p className="text-base text-[#4a453e] whitespace-pre-line leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>

            {/* Inquire CTA */}
            <div className="pt-6 border-t border-[#eee8df]">
              {submittedInquiry ? (
                <div className="bg-[#ecfdf5] border border-[#a7f3d0] text-[#065f46] p-4 rounded text-sm font-serif">
                  <b>Inquiry sent!</b> The vendor will reply directly to your
                  KwantuHub account conversations.
                </div>
              ) : (
                <button
                  onClick={() => setShowInquiryModal(true)}
                  className="w-full text-center text-xs font-serif font-bold uppercase tracking-widest text-white brand-gradient py-4 rounded hover:opacity-95 transition cursor-pointer shadow-md"
                >
                  Contact Vendor / Submit Inquiry
                </button>
              )}
            </div>
          </div>
        </div>

        <ContactReveal listingId={item.id} />

        {/* Related Products / Services Row */}
        {relatedItems && relatedItems.length > 0 && (
          <section className="mt-8 border-t border-[#d9d0c4] pt-12">
            <div className="flex justify-between items-end mb-8">
              <div>
                <span className="text-xs font-serif font-bold uppercase tracking-widest text-[#fe8129] block mb-1">
                  MORE IN {item.category.name}
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#0a0a0a]">
                  Related{" "}
                  <span className="italic font-normal">
                    Creations & Services
                  </span>
                </h2>
              </div>
              <Link
                href={`/marketplace?category=${item.category.slug}`}
                className="text-xs font-serif font-bold uppercase tracking-wider text-[#d71466] hover:underline"
              >
                Browse category →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {relatedItems.map(rel => {
                const coverImage = rel.media?.[0]?.url;
                return (
                  <Link
                    key={rel.id}
                    href={`/listings/${rel.slug}`}
                    className="group bg-white border border-[#d9d0c4] rounded-lg overflow-hidden shadow-xs hover:border-[#d71466] hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      {coverImage ? (
                        <div className="h-48 bg-[#0a0a0a] overflow-hidden relative">
                          <img
                            src={coverImage}
                            alt={rel.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <span className="absolute top-2.5 left-2.5 text-[10px] font-serif font-bold uppercase tracking-widest bg-white/95 text-[#0a0a0a] px-2 py-0.5 rounded">
                            {rel.listingType}
                          </span>
                        </div>
                      ) : (
                        <div className="h-48 brand-gradient p-4 flex items-end">
                          <span className="text-[10px] font-serif font-bold uppercase tracking-widest bg-white/95 text-[#0a0a0a] px-2 py-0.5 rounded">
                            {rel.listingType}
                          </span>
                        </div>
                      )}

                      <div className="p-5">
                        <span className="text-[10px] font-serif font-bold uppercase tracking-widest text-[#fe8129] block mb-1">
                          {rel.vendor.businessName}
                        </span>
                        <h3 className="font-serif font-bold text-lg text-[#0a0a0a] group-hover:text-[#d71466] transition mb-1 line-clamp-1">
                          {rel.title}
                        </h3>
                        <p className="text-xs font-serif text-[#68635c] line-clamp-2 leading-relaxed">
                          {rel.description}
                        </p>
                      </div>
                    </div>

                    <div className="p-5 pt-0 flex justify-between items-center text-xs border-t border-[#eee8df] mt-2">
                      <span className="font-serif font-bold text-[#0a0a0a]">
                        {rel.priceIndication || "Inquire"}
                      </span>
                      <span className="font-serif font-bold text-[#d71466] group-hover:underline">
                        View details →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Inquiry Modal */}
      {showInquiryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-lg w-full p-6 border border-[#d9d0c4] shadow-xl">
            <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-2">
              Inquire about {item.title}
            </h3>
            <p className="text-xs font-serif text-[#68635c] mb-6">
              Send a direct message to {item.vendor.businessName}. You can track
              this conversation in your account.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-serif font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={inquirySubject || `Inquiry regarding ${item.title}`}
                  onChange={e => setInquirySubject(e.target.value)}
                  className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0] font-serif"
                />
              </div>

              <div>
                <label className="text-[11px] font-serif font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                  Your Message
                </label>
                <textarea
                  rows={4}
                  value={inquiryMsg}
                  onChange={e => setInquiryMsg(e.target.value)}
                  placeholder="Ask about custom sizing, delivery timelines, bulk orders, or scheduling..."
                  className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0] font-serif"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#eee8df]">
                <button
                  onClick={() => setShowInquiryModal(false)}
                  className="text-xs font-serif font-bold uppercase tracking-wider px-4 py-2 border border-[#d9d0c4] rounded hover:bg-[#faf6f0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!inquiryMsg) return;
                    createInquiryMutation.mutate({
                      listingId: item.id,
                      subject:
                        inquirySubject || `Inquiry regarding ${item.title}`,
                      message: inquiryMsg,
                    });
                  }}
                  disabled={createInquiryMutation.isPending || !inquiryMsg}
                  className="text-xs font-serif font-bold uppercase tracking-wider text-white brand-gradient px-6 py-2 rounded hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {createInquiryMutation.isPending
                    ? "Sending..."
                    : "Send Inquiry"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
