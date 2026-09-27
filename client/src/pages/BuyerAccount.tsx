import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function BuyerAccount() {
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "wishlist" | "inquiries" | "settings"
  >("inquiries");
  const [emailInquiries, setEmailInquiries] = useState(true);
  const [emailReplies, setEmailReplies] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const { data: wishlist, isLoading: loadingWishlist } =
    trpc.buyer.wishlist.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  const { data: inquiries, isLoading: loadingInquiries } =
    trpc.buyer.inquiries.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  const utils = trpc.useUtils();
  const toggleWishlist = trpc.buyer.toggleWishlist.useMutation({
    onSuccess: () => utils.buyer.wishlist.invalidate(),
  });
  const updateProfile = trpc.auth.updateProfile.useMutation();
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-serif font-bold text-[#0a0a0a] mb-4">
            Sign in to view your account
          </h2>
          <p className="text-[#68635c] font-serif mb-6">
            Track saved diaspora offerings and conversations with vendors.
          </p>
          <Link
            href="/login"
            className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-3 rounded"
          >
            Sign In with JWT
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
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] block mb-2">
            BUYER PORTAL
          </span>
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-[#0a0a0a]">
            Your saved <span className="italic font-normal">connections.</span>
          </h1>
          <p className="text-[#68635c] font-serif mt-1">
            Welcome back, {user?.name || "Community Member"}. Manage inquiries
            and saved creations.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#d9d0c4] mb-8 gap-8">
          <button
            onClick={() => setActiveTab("inquiries")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
              activeTab === "inquiries"
                ? "border-[#d71466] text-[#d71466]"
                : "border-transparent text-[#68635c] hover:text-[#0a0a0a]"
            }`}
          >
            Conversations ({inquiries?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("wishlist")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
              activeTab === "wishlist"
                ? "border-[#d71466] text-[#d71466]"
                : "border-transparent text-[#68635c] hover:text-[#0a0a0a]"
            }`}
          >
            Saved Items ({wishlist?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
              activeTab === "settings"
                ? "border-[#d71466] text-[#d71466]"
                : "border-transparent text-[#68635c] hover:text-[#0a0a0a]"
            }`}
          >
            Settings
          </button>
        </div>

        {/* Inquiries */}
        {activeTab === "inquiries" && (
          <div className="space-y-6">
            {loadingInquiries ? (
              <div className="text-center py-12 font-serif text-[#68635c]">
                Loading conversations...
              </div>
            ) : (inquiries?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-12 rounded text-center">
                <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-2">
                  No active inquiries
                </h3>
                <p className="text-[#68635c] font-serif mb-6">
                  Browse the marketplace to discover vendors and submit direct
                  questions.
                </p>
                <Link
                  href="/marketplace"
                  className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-3 rounded"
                >
                  Explore Marketplace
                </Link>
              </div>
            ) : (
              inquiries?.map(inq => (
                <div
                  key={inq.id}
                  className="bg-white border border-[#d9d0c4] p-6 rounded shadow-xs"
                >
                  <div className="flex justify-between items-start mb-4 border-b border-[#eee8df] pb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#d71466] block">
                        To: {inq.vendor.businessName}
                      </span>
                      <h3 className="font-serif font-bold text-xl text-[#0a0a0a]">
                        {inq.subject}
                      </h3>
                      <Link
                        href={`/listings/${inq.listing.slug}`}
                        className="text-xs text-[#68635c] hover:underline"
                      >
                        Regarding: {inq.listing.title}
                      </Link>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-[#ecfdf5] text-[#065f46] px-2.5 py-1 rounded">
                      {inq.status}
                    </span>
                  </div>

                  <div className="space-y-3 pl-2">
                    {inq.messages.map(m => (
                      <div
                        key={m.id}
                        className={`p-3 rounded text-sm max-w-xl ${
                          m.senderId === user?.id
                            ? "bg-[#faf6f0] border border-[#eee8df] ml-auto text-right"
                            : "bg-[#fff7ed] border border-[#fed7aa] mr-auto text-left"
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#888] block mb-1">
                          {m.senderId === user?.id
                            ? "You"
                            : inq.vendor.businessName}
                        </span>
                        <p className="font-serif text-[#333]">{m.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Wishlist */}
        {activeTab === "wishlist" && (
          <div>
            {loadingWishlist ? (
              <div className="text-center py-12 font-serif text-[#68635c]">
                Loading saved items...
              </div>
            ) : (wishlist?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-12 rounded text-center">
                <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-2">
                  No saved items
                </h3>
                <p className="text-[#68635c] font-serif mb-6">
                  Save items from the marketplace to revisit them later.
                </p>
                <Link
                  href="/marketplace"
                  className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-3 rounded"
                >
                  Browse Marketplace
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {wishlist?.map(({ listing }) => (
                  <div
                    key={listing.id}
                    className="bg-white border border-[#d9d0c4] rounded overflow-hidden p-5 flex flex-col justify-between"
                  >
                    <div>
                      <h3 className="font-serif font-bold text-xl text-[#0a0a0a] mb-2">
                        {listing.title}
                      </h3>
                      <p className="text-sm font-serif text-[#68635c] line-clamp-2 mb-4">
                        {listing.description}
                      </p>
                      <span className="text-sm font-bold text-[#0a0a0a]">
                        {listing.priceIndication || "Inquire"}
                      </span>
                    </div>

                    <div className="pt-4 mt-4 border-t border-[#eee8df] flex justify-between items-center text-xs">
                      <Link
                        href={`/listings/${listing.slug}`}
                        className="text-[#d71466] font-bold"
                      >
                        View Listing →
                      </Link>
                      <button
                        onClick={() =>
                          toggleWishlist.mutate({ listingId: listing.id })
                        }
                        className="text-[#68635c] hover:text-red-600 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="bg-white border border-[#d9d0c4] p-6 rounded">
              <p className="text-xs font-bold uppercase tracking-widest text-[#d71466] mb-1">
                Account preferences
              </p>
              <h2 className="font-serif text-3xl font-bold text-[#0a0a0a] mb-2">
                Stay in control
              </h2>
              <p className="font-serif text-sm text-[#68635c] mb-6">
                Choose how KwantuHub keeps you informed about your buyer
                connections.
              </p>
              <div className="space-y-4 font-serif text-sm text-[#333]">
                <label className="flex items-center justify-between gap-4 border-b border-[#eee8df] pb-3">
                  <span>Email me when a vendor replies</span>
                  <input
                    type="checkbox"
                    checked={emailReplies}
                    onChange={event => setEmailReplies(event.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-4 border-b border-[#eee8df] pb-3">
                  <span>Email me about inquiry updates</span>
                  <input
                    type="checkbox"
                    checked={emailInquiries}
                    onChange={event => setEmailInquiries(event.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-4 border-b border-[#eee8df] pb-3">
                  <span>Send occasional product updates</span>
                  <input
                    type="checkbox"
                    checked={productUpdates}
                    onChange={event => setProductUpdates(event.target.checked)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="mt-6 text-xs font-bold uppercase tracking-wider text-white brand-gradient px-5 py-2.5 rounded"
                disabled={updateProfile.isPending}
                onClick={() =>
                  updateProfile.mutate({
                    notificationPreferences: {
                      emailInquiries,
                      emailReplies,
                      productUpdates,
                    },
                  })
                }
              >
                {updateProfile.isPending ? "Saving…" : "Save preferences"}
              </button>
            </section>

            <section className="bg-white border border-[#d9d0c4] p-6 rounded">
              <p className="text-xs font-bold uppercase tracking-widest text-[#fe8129] mb-1">
                Security
              </p>
              <h2 className="font-serif text-3xl font-bold text-[#0a0a0a] mb-2">
                Change password
              </h2>
              <div className="space-y-4 mt-5">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  placeholder="Current password"
                  className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  placeholder="New password (8+ characters)"
                  className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                />
                <button
                  type="button"
                  className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-5 py-2.5 rounded disabled:opacity-50"
                  disabled={
                    changePassword.isPending ||
                    currentPassword.length < 6 ||
                    newPassword.length < 8
                  }
                  onClick={() =>
                    changePassword.mutate({ currentPassword, newPassword })
                  }
                >
                  {changePassword.isPending ? "Updating…" : "Update password"}
                </button>
                {changePassword.error && (
                  <p className="form-error">{changePassword.error.message}</p>
                )}
              </div>
              <Link
                href="/profile"
                className="inline-block mt-8 text-xs font-bold uppercase tracking-wider text-[#d71466] hover:underline"
              >
                Open full profile →
              </Link>
            </section>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
