import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { NotificationCenter } from "@/components/NotificationCenter";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { ContactVerification } from "@/components/ContactVerification";
import { VendorVerificationCenter } from "@/components/VendorVerificationCenter";
import TurnstileField from "@/components/TurnstileField";

function formatRelativeTime(value: Date | string | null) {
  if (!value) return "No messages yet";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

type ContactField = {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
};

export default function VendorPortal() {
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "listings" | "inquiries" | "analytics" | "reviews" | "profile"
  >("listings");

  // New listing form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState<number | "">("");
  const [newType, setNewType] = useState<"product" | "service">("product");
  const [newPrice, setNewPrice] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newRemote, setNewRemote] = useState(false);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [leadNotes, setLeadNotes] = useState<Record<number, string>>({});
  const [followUpDates, setFollowUpDates] = useState<Record<number, string>>({});
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [imessage, setImessage] = useState("");
  const [instagram, setInstagram] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [analyticsCategory, setAnalyticsCategory] = useState("");
  const [analyticsFrom, setAnalyticsFrom] = useState("");
  const [analyticsTo, setAnalyticsTo] = useState("");
  const [standardsAcknowledged, setStandardsAcknowledged] = useState(false);
  const [publishTurnstileToken, setPublishTurnstileToken] = useState<string>();

  const utils = trpc.useUtils();
  const { data: profile } = trpc.vendor.getProfile.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: listings } = trpc.vendor.listings.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: inquiries } = trpc.vendor.inquiries.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const analyticsInput = useMemo(() => ({
    categoryId: analyticsCategory ? Number(analyticsCategory) : undefined,
    from: analyticsFrom || undefined,
    to: analyticsTo || undefined,
  }), [analyticsCategory, analyticsFrom, analyticsTo]);
  const { data: analytics } = trpc.vendor.analytics.useQuery(analyticsInput, {
    enabled: isAuthenticated,
  });
  const { data: reviews } = trpc.vendor.reviews.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: leadFunnelData } = trpc.vendor.leadFunnel.useQuery(undefined, {
    enabled: isAuthenticated && activeTab === "inquiries",
  });
  const { data: categories } = trpc.categories.list.useQuery();

  useEffect(() => {
    if (!profile) return;
    setPhone(profile.phone || "");
    setWhatsapp(profile.whatsapp || "");
    setImessage(profile.imessage || "");
    setInstagram(profile.instagram || "");
    setContactEmail(profile.contactEmail || "");
    setWebsite(profile.website || "");
    setServiceArea(profile.serviceArea || "");
    setRemoteAvailable(Boolean(profile.remoteAvailable));
    setStandardsAcknowledged(Boolean(profile.standardsAcknowledgedAt));
  }, [profile]);

  const saveListingMutation = trpc.vendor.saveListing.useMutation({
    onSuccess: () => {
      setNewTitle("");
      setNewDesc("");
      setNewPrice("");
      utils.vendor.listings.invalidate();
    },
  });

  const replyMutation = trpc.vendor.replyInquiry.useMutation({
    onSuccess: (_, vars) => {
      setReplyText(prev => ({ ...prev, [vars.inquiryId]: "" }));
      utils.vendor.inquiries.invalidate();
    },
  });
  const markInquiryRead = trpc.vendor.markInquiryRead.useMutation({
    onSuccess: () => utils.vendor.inquiries.invalidate(),
  });
  const closeInquiryMutation = trpc.vendor.closeInquiry.useMutation({
    onSuccess: () => utils.vendor.inquiries.invalidate(),
  });
  const reopenInquiryMutation = trpc.vendor.reopenInquiry.useMutation({
    onSuccess: () => utils.vendor.inquiries.invalidate(),
  });
  const archiveInquiryMutation = trpc.vendor.archiveInquiry.useMutation({
    onSuccess: () => utils.vendor.inquiries.invalidate(),
  });
  const unarchiveInquiryMutation = trpc.vendor.unarchiveInquiry.useMutation({
    onSuccess: () => utils.vendor.inquiries.invalidate(),
  });
  const updateLeadStageMutation = trpc.vendor.updateLeadStage.useMutation({
    onSuccess: () => utils.vendor.inquiries.invalidate(),
  });
  const reportConversationMutation = trpc.vendor.reportConversation.useMutation();

  const saveProfileMutation = trpc.vendor.saveProfile.useMutation({
    onSuccess: () => utils.vendor.getProfile.invalidate(),
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-serif font-bold text-[#0a0a0a] mb-4">
            Vendor Access Required
          </h2>
          <p className="text-[#68635c] font-serif mb-6">
            Sign in to manage your vendor storefront, listings, and inquiries.
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

  const isApproved = profile?.approvalStatus === "approved";
  const contactFields: ContactField[] = [
    {
      label: "Phone",
      value: phone,
      setValue: setPhone,
      placeholder: "e.g. +1 713 555 0148",
    },
    {
      label: "WhatsApp",
      value: whatsapp,
      setValue: setWhatsapp,
      placeholder: "International number or link",
    },
    {
      label: "iMessage",
      value: imessage,
      setValue: setImessage,
      placeholder: "Apple ID email or number",
    },
    {
      label: "Instagram",
      value: instagram,
      setValue: setInstagram,
      placeholder: "@yourhandle",
    },
    {
      label: "Contact email",
      value: contactEmail,
      setValue: setContactEmail,
      placeholder: "hello@yourbrand.com",
    },
    {
      label: "Website",
      value: website,
      setValue: setWebsite,
      placeholder: "https://yourbrand.com",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-8 py-12 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#fe8129] block mb-2">
              VENDOR WORKSPACE
            </span>
            <h1 className="text-4xl sm:text-5xl font-serif font-bold text-[#0a0a0a]">
              {profile?.businessName || "Vendor Portal"}
            </h1>
            <p className="text-xs text-[#68635c] mt-1">
              Status:{" "}
              <span
                className={`font-bold uppercase ${isApproved ? "text-green-700" : "text-amber-700"}`}
              >
                {profile?.approvalStatus || "Pending Application"}
              </span>
            </p>
          </div>

          {profile?.storefront && isApproved && (
            <Link
              href={`/storefronts/${profile.storefront.slug}`}
              className="text-xs font-bold uppercase tracking-wider text-[#d71466] border border-[#d71466] px-4 py-2 rounded hover:bg-[#d71466] hover:text-white transition"
            >
              View Public Storefront →
            </Link>
          )}
        </div>

        <div className="mb-8 max-w-2xl">
          <NotificationCenter mode="panel" />
        </div>

        {!isApproved && (
          <div className="bg-[#fffbeb] border border-[#fde68a] text-[#92400e] p-6 rounded mb-8 text-sm">
            <h4 className="font-bold text-base mb-1">
              Your vendor application is under review
            </h4>
            <p>
              An administrator will review your vendor profile before listings
              are published to the public marketplace. You can still prepare
              your catalog drafts and review incoming customer inquiries.
            </p>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#d9d0c4] mb-8 gap-8">
          <button
            onClick={() => setActiveTab("listings")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
              activeTab === "listings"
                ? "border-[#d71466] text-[#d71466]"
                : "border-transparent text-[#68635c]"
            }`}
          >
            Listings Catalog ({listings?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("inquiries")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
              activeTab === "inquiries"
                ? "border-[#d71466] text-[#d71466]"
                : "border-transparent text-[#68635c]"
            }`}
          >
            Buyer Inquiries ({inquiries?.length || 0})
            {(inquiries?.reduce((total, inquiry) => total + inquiry.unreadCount, 0) || 0) > 0 && (
              <span className="ml-2 rounded-full bg-[#d71466] px-2 py-0.5 text-[10px] text-white">
                {inquiries?.reduce((total, inquiry) => total + inquiry.unreadCount, 0)} new
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
              activeTab === "analytics"
                ? "border-[#d71466] text-[#d71466]"
                : "border-transparent text-[#68635c]"
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTab("reviews")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
              activeTab === "reviews"
                ? "border-[#d71466] text-[#d71466]"
                : "border-transparent text-[#68635c]"
            }`}
          >
            Reviews ({reviews?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition ${
              activeTab === "profile"
                ? "border-[#d71466] text-[#d71466]"
                : "border-transparent text-[#68635c]"
            }`}
          >
            Profile & Settings
          </button>
        </div>

        {/* Listings Tab */}
        {activeTab === "listings" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Create Listing Form */}
            <div className="lg:col-span-1 bg-white border border-[#d9d0c4] p-6 rounded h-fit">
              <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-4">
                Add Creation / Service
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="e.g. Ankara Infinity Dress"
                    className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(Number(e.target.value))}
                    className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                  >
                    <option value="">Select Category</option>
                    {(categories || []).map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                    Type
                  </label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as any)}
                    className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                  >
                    <option value="product">Product</option>
                    <option value="service">Service</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                    Price Indication
                  </label>
                  <input
                    type="text"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    placeholder="e.g. $85.00 or Inquire"
                    className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Materials, origin, turnaround, or package details..."
                    className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                  />
                </div>

                <TurnstileField action="publish_listing" onToken={setPublishTurnstileToken} />
                {saveListingMutation.error && (
                  <p className="form-error text-xs text-red-700">
                    {saveListingMutation.error.message}
                  </p>
                )}

                <button
                  onClick={() => {
                    if (!newTitle || !newDesc || !newCategory) return;
                    saveListingMutation.mutate({
                      title: newTitle,
                      description: newDesc,
                      categoryId: Number(newCategory),
                      listingType: newType,
                      priceIndication: newPrice || "Inquire",
                      status: "published",
                      turnstileToken: publishTurnstileToken,
                    });
                  }}
                  disabled={
                    saveListingMutation.isPending ||
                    !newTitle ||
                    !newDesc ||
                    !newCategory ||
                    !isApproved
                  }
                  className="w-full text-xs font-bold uppercase tracking-wider text-white brand-gradient py-3 rounded disabled:opacity-50 cursor-pointer"
                >
                  {saveListingMutation.isPending
                    ? "Publishing..."
                    : "Publish to Marketplace"}
                </button>
              </div>
            </div>

            {/* Existing Listings */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-4">
                Your Listings
              </h3>

              {(listings?.length || 0) === 0 ? (
                <div className="bg-white border border-[#d9d0c4] p-8 rounded text-center text-[#68635c] font-serif">
                  No listings created yet. Use the form to publish your first
                  piece.
                </div>
              ) : (
                listings?.map(item => (
                  <div
                    key={item.id}
                    className="bg-white border border-[#d9d0c4] p-5 rounded flex justify-between items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#faf6f0] text-[#0a0a0a] px-2 py-0.5 rounded">
                          {item.listingType}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            item.status === "published"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <h4 className="font-serif font-bold text-xl text-[#0a0a0a]">
                        {item.title}
                      </h4>
                      <p className="text-xs text-[#68635c] mt-1 font-serif">
                        {item.priceIndication || "Inquire"}
                      </p>
                    </div>

                    <Link
                      href={`/listings/${item.slug}`}
                      className="text-xs font-bold uppercase tracking-wider text-[#d71466] hover:underline"
                    >
                      View Live →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Inquiries Tab */}
        {activeTab === "inquiries" && (
          <div className="space-y-6">
            {/* Vendor Lead Conversion Funnel */}
            <div className="bg-white border border-[#d9d0c4] p-5 rounded space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-serif font-bold text-xl text-[#0a0a0a]">
                    Your Inquiry Lead Funnel
                  </h3>
                  <p className="text-xs text-[#68635c] font-serif">
                    Track buyer engagement from initial question to completed sale.
                  </p>
                </div>
                <strong className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded">
                  {Math.round((leadFunnelData?.conversionRate || 0) * 100)}% Win Rate
                </strong>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-center text-xs">
                <div className="p-2.5 bg-[#faf6f0] border border-[#eee8df] rounded">
                  <span className="text-[10px] font-bold uppercase text-[#68635c] block">New</span>
                  <strong className="font-serif text-base text-[#0a0a0a] block mt-0.5">{leadFunnelData?.counts.new_inquiry || 0}</strong>
                </div>
                <div className="p-2.5 bg-[#faf6f0] border border-[#eee8df] rounded">
                  <span className="text-[10px] font-bold uppercase text-[#68635c] block">Contacted</span>
                  <strong className="font-serif text-base text-[#0a0a0a] block mt-0.5">{leadFunnelData?.counts.contacted || 0}</strong>
                </div>
                <div className="p-2.5 bg-[#faf6f0] border border-[#eee8df] rounded">
                  <span className="text-[10px] font-bold uppercase text-[#68635c] block">Quotes Sent</span>
                  <strong className="font-serif text-base text-[#0a0a0a] block mt-0.5">{leadFunnelData?.counts.quote_sent || 0}</strong>
                </div>
                <div className="p-2.5 bg-[#faf6f0] border border-[#eee8df] rounded">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">Deals Won</span>
                  <strong className="font-serif text-base text-emerald-800 block mt-0.5">{leadFunnelData?.counts.deal_won || 0}</strong>
                </div>
                <div className="p-2.5 bg-[#faf6f0] border border-[#eee8df] rounded">
                  <span className="text-[10px] font-bold uppercase text-[#8c827a] block">Lost / Closed</span>
                  <strong className="font-serif text-base text-[#8c827a] block mt-0.5">{leadFunnelData?.counts.deal_lost || 0}</strong>
                </div>
              </div>
            </div>

            {(inquiries?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-12 rounded text-center text-[#68635c] font-serif">
                No customer inquiries yet. Buyer questions about your items will
                appear here.
              </div>
            ) : (
              inquiries?.map(inq => (
                <div
                  key={inq.id}
                  className="bg-white border border-[#d9d0c4] p-6 rounded shadow-xs"
                >
                  <div className="flex justify-between items-start mb-4 border-b border-[#eee8df] pb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#fe8129] block">
                        Buyer: {inq.buyer.name || "Community Customer"} (
                        {inq.buyer.email})
                      </span>
                      <h3 className="font-serif font-bold text-xl text-[#0a0a0a]">
                        {inq.subject}
                      </h3>
                      <span className="text-xs text-[#68635c]">
                        Regarding: {inq.listing.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {inq.unreadCount > 0 && (
                        <span className="rounded-full bg-[#d71466] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                          {inq.unreadCount} unread
                        </span>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded ${
                        inq.status === "open"
                          ? "bg-[#ecfdf5] text-[#065f46]"
                          : "bg-[#f3f4f6] text-[#4b5563]"
                      }`}>
                        {inq.status}
                      </span>
                    </div>
                  </div>

                  <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[#68635c]">
                    {inq.conversationState === "awaiting_vendor"
                      ? "Awaiting your reply"
                      : inq.conversationState === "awaiting_buyer"
                        ? "Awaiting buyer reply"
                        : inq.conversationState === "resolved"
                          ? "Conversation resolved"
                          : inq.conversationState === "archived"
                            ? "Conversation archived"
                            : "Conversation open"}
                  </p>
                  <p className="mb-4 text-xs text-[#888]">
                    Last activity {formatRelativeTime(inq.lastMessageAt)}
                    {inq.responseTimeSeconds !== null &&
                      ` · First response ${Math.max(1, Math.round(inq.responseTimeSeconds / 60))}m`}
                  </p>

                  <div className="space-y-3 mb-6">
                    {inq.messages.map(m => (
                      <div
                        key={m.id}
                        className={`p-3 rounded text-sm max-w-xl ${
                          m.senderId === user?.id
                            ? "bg-[#fff7ed] border border-[#fed7aa] ml-auto text-right"
                            : "bg-[#faf6f0] border border-[#eee8df] mr-auto text-left"
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#888] block mb-1">
                          {m.senderId === user?.id
                            ? "You (Vendor)"
                            : inq.buyer.name || "Buyer"}
                        </span>
                        <p className="font-serif text-[#333]">{m.body}</p>
                        <span className="mt-1 block text-[10px] text-[#999]">
                          {formatRelativeTime(m.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {inq.unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markInquiryRead.mutate({ inquiryId: inq.id })}
                      disabled={markInquiryRead.isPending}
                      className="mb-3 text-xs font-bold uppercase tracking-wider text-[#d71466] hover:underline"
                    >
                      Mark messages read
                    </button>
                  )}

                  {/* Vendor Lead Stage & Private Notes (Protected - Never Exposed to Buyers) */}
                  <div className="my-4 p-4 bg-[#faf6f0] border border-[#eee8df] rounded space-y-3">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block">
                          Lead Stage (Vendor Only)
                        </span>
                        <select
                          value={inq.leadStage || "new_inquiry"}
                          onChange={e =>
                            updateLeadStageMutation.mutate({
                              inquiryId: inq.id,
                              stage: e.target.value as any,
                              notes: leadNotes[inq.id] !== undefined ? leadNotes[inq.id] : (inq.vendorPrivateNotes || undefined),
                            })
                          }
                          disabled={updateLeadStageMutation.isPending}
                          className="text-xs font-serif border border-[#d9d0c4] rounded px-2.5 py-1 bg-white mt-1"
                        >
                          <option value="new_inquiry">New Inquiry</option>
                          <option value="contacted">Contacted</option>
                          <option value="quote_sent">Quote / Details Sent</option>
                          <option value="deal_won">Deal Won (Success)</option>
                          <option value="deal_lost">Deal Lost / Closed</option>
                        </select>
                      </div>
                      {inq.leadStage === "deal_won" && (
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                          ★ Deal Won
                        </span>
                      )}
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block">
                          Follow-up Date
                        </span>
                        <input
                          type="date"
                          value={followUpDates[inq.id] || (inq.followUpDate ? new Date(inq.followUpDate).toISOString().slice(0, 10) : "")}
                          onChange={e => {
                            const val = e.target.value;
                            setFollowUpDates(prev => ({ ...prev, [inq.id]: val }));
                            if (val) {
                              updateLeadStageMutation.mutate({
                                inquiryId: inq.id,
                                stage: (inq.leadStage as any) || "new_inquiry",
                                followUpDate: new Date(val),
                              });
                            }
                          }}
                          className="text-xs border border-[#d9d0c4] rounded px-2.5 py-1 bg-white mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                        Private Vendor Notes (Buyers never see this)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={leadNotes[inq.id] !== undefined ? leadNotes[inq.id] : (inq.vendorPrivateNotes || "")}
                          onChange={e => setLeadNotes(prev => ({ ...prev, [inq.id]: e.target.value }))}
                          placeholder="e.g. Buyer asked for custom dimensions, offered $120..."
                          className="flex-1 text-xs border border-[#d9d0c4] rounded px-3 py-1.5 bg-white font-serif"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateLeadStageMutation.mutate({
                              inquiryId: inq.id,
                              stage: (inq.leadStage as any) || "new_inquiry",
                              notes: leadNotes[inq.id] || "",
                            })
                          }
                          disabled={updateLeadStageMutation.isPending}
                          className="text-[11px] font-bold uppercase tracking-wider text-[#0a0a0a] border border-[#d9d0c4] px-3 py-1.5 rounded hover:bg-white"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  </div>

                  {inq.status === "open" && (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          value={replyText[inq.id] || ""}
                          onChange={e => setReplyText(prev => ({ ...prev, [inq.id]: e.target.value }))}
                          placeholder="Write your reply to the buyer..."
                          className="flex-1 text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                        />
                        <button
                          type="button"
                          onClick={() => replyMutation.mutate({ inquiryId: inq.id, message: replyText[inq.id] || "" })}
                          disabled={replyMutation.isPending || !replyText[inq.id]?.trim()}
                          className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-2 rounded cursor-pointer disabled:opacity-50"
                        >
                          Send Reply
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => closeInquiryMutation.mutate({ inquiryId: inq.id })}
                        disabled={closeInquiryMutation.isPending}
                        className="text-xs font-bold uppercase tracking-wider text-[#68635c] hover:text-[#d71466]"
                      >
                        Mark conversation resolved
                      </button>
                    </div>
                  )}
                  {inq.status === "closed" && (
                    <div className="flex flex-wrap gap-4">
                      <button
                        type="button"
                        onClick={() => reopenInquiryMutation.mutate({ inquiryId: inq.id })}
                        disabled={reopenInquiryMutation.isPending}
                        className="text-xs font-bold uppercase tracking-wider text-[#d71466] hover:underline disabled:opacity-50"
                      >
                        Reopen conversation
                      </button>
                      <button
                        type="button"
                        onClick={() => archiveInquiryMutation.mutate({ inquiryId: inq.id })}
                        disabled={archiveInquiryMutation.isPending}
                        className="text-xs font-bold uppercase tracking-wider text-[#68635c] hover:text-[#d71466] disabled:opacity-50"
                      >
                        Archive
                      </button>
                    </div>
                  )}
                  {inq.status === "open" && (
                    <button
                      type="button"
                      onClick={() => archiveInquiryMutation.mutate({ inquiryId: inq.id })}
                      disabled={archiveInquiryMutation.isPending}
                      className="text-xs font-bold uppercase tracking-wider text-[#68635c] hover:text-[#d71466] disabled:opacity-50"
                    >
                      Archive conversation
                    </button>
                  )}
                  {inq.status === "archived" && (
                    <button
                      type="button"
                      onClick={() => unarchiveInquiryMutation.mutate({ inquiryId: inq.id })}
                      disabled={unarchiveInquiryMutation.isPending}
                      className="text-xs font-bold uppercase tracking-wider text-[#d71466] hover:underline disabled:opacity-50"
                    >
                      Unarchive conversation
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt("Why are you reporting this conversation?");
                      if (reason?.trim()) {
                        reportConversationMutation.mutate({ inquiryId: inq.id, reason: reason.trim() });
                      }
                    }}
                    disabled={reportConversationMutation.isPending}
                    className="mt-4 block text-xs font-bold uppercase tracking-wider text-[#68635c] hover:text-[#d71466] disabled:opacity-50"
                  >
                    Report conversation
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "analytics" && (
          <section className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#d71466]">
                Engagement overview
              </p>
              <h2 className="font-serif text-3xl font-bold text-[#0a0a0a]">
                How your catalog is moving
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded border border-[#d9d0c4] bg-white p-4">
              <select value={analyticsCategory} onChange={event => setAnalyticsCategory(event.target.value)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]"><option value="">All categories</option>{categories?.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              <input type="date" value={analyticsFrom} onChange={event => setAnalyticsFrom(event.target.value)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" aria-label="Analytics from date" />
              <input type="date" value={analyticsTo} onChange={event => setAnalyticsTo(event.target.value)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" aria-label="Analytics to date" />
            </div>
            <div className="portal-metrics">
              <div className="portal-metric">
                <strong>{analytics?.views || 0}</strong>
                <span>Listing views</span>
              </div>
              <div className="portal-metric">
                <strong>{analytics?.saves || 0}</strong>
                <span>Saves</span>
              </div>
              <div className="portal-metric">
                <strong>{analytics?.contactReveals || 0}</strong>
                <span>Contact reveals</span>
              </div>
              <div className="portal-metric">
                <strong>{analytics?.inquiries || 0}</strong>
                <span>Inquiries</span>
              </div>
              <div className="portal-metric">
                <strong>{analytics?.listings || 0}</strong>
                <span>Total listings</span>
              </div>
              <div className="portal-metric">
                <strong>{analytics?.unread || 0}</strong>
                <span>Unread leads</span>
              </div>
              <div className="portal-metric">
                <strong>{analytics ? `${Math.round((analytics.responseRate || 0) * 100)}%` : "0%"}</strong>
                <span>Response rate</span>
              </div>
              <div className="portal-metric">
                <strong>{analytics?.resolved || 0}</strong>
                <span>Resolved inquiries</span>
              </div>
              <div className="portal-metric">
                <strong>{analytics?.averageResponseSeconds ? `${Math.round(analytics.averageResponseSeconds / 3600)}h` : "—"}</strong>
                <span>Avg response time</span>
              </div>
            </div>
            <div className="bg-white border border-[#d9d0c4] p-6 rounded font-serif text-[#68635c]">
              Engagement signals are recorded when buyers view, save, inquire,
              or reveal a configured contact channel. Use these metrics to
              decide which offerings need a stronger story or new imagery.
            </div>
            <div className="bg-white border border-[#d9d0c4] rounded overflow-hidden">
              <div className="border-b border-[#eee8df] p-5"><h3 className="font-serif text-2xl font-bold text-[#0a0a0a]">Top inquiry listings</h3><p className="text-sm text-[#68635c] font-serif mt-1">Ranked by inquiry volume for the selected scope.</p></div>
              <div className="divide-y divide-[#eee8df]">
                {(analytics?.topListings || []).map(item => <div key={item.listingId} className="flex justify-between gap-4 px-5 py-4"><span className="font-serif">{item.title}</span><strong className="text-sm text-[#d71466]">{item.inquiries} inquiries</strong></div>)}
                {!analytics?.topListings?.length && <p className="px-5 py-6 font-serif text-sm text-[#68635c]">No inquiry activity in this scope yet.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "reviews" && (
          <section className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#fe8129]">
                Community feedback
              </p>
              <h2 className="font-serif text-3xl font-bold text-[#0a0a0a]">
                Ratings & reviews
              </h2>
            </div>
            {(reviews?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-10 rounded text-center font-serif text-[#68635c]">
                Approved buyer reviews will appear here as the community engages
                with your listings.
              </div>
            ) : (
              reviews?.map(({ review, buyer, listing }) => (
                <article
                  key={review.id}
                  className="bg-white border border-[#d9d0c4] p-6 rounded"
                >
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-serif text-xl font-bold">
                        {listing.title}
                      </h3>
                      <p className="text-xs text-[#68635c]">
                        By {buyer.name || "Community buyer"}
                      </p>
                    </div>
                    <strong className="text-[#d71466]">
                      {"★".repeat(review.rating)}
                    </strong>
                  </div>
                  <p className="font-serif text-[#333] mt-4">
                    {review.comment || "No written feedback."}
                  </p>
                </article>
              ))
            )}
          </section>
        )}

        {activeTab === "profile" && (
          <section className="grid grid-cols-1 lg:grid-cols-[1fr_0.8fr] gap-8">
            <div className="bg-white border border-[#d9d0c4] p-6 rounded">
              <p className="text-xs font-bold uppercase tracking-widest text-[#d71466] mb-1">
                Vendor settings
              </p>
              <h2 className="font-serif text-3xl font-bold text-[#0a0a0a] mb-2">
                Contact channels
              </h2>
              <p className="font-serif text-sm text-[#68635c] mb-6">
                Choose which channels buyers can reveal from an individual
                listing. Leave a field blank to keep it private.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {contactFields.map(field => (
                  <label
                    key={field.label}
                    className="text-xs font-bold uppercase tracking-wider text-[#68635c]"
                  >
                    {field.label}
                    <input
                      type="text"
                      value={field.value}
                      onChange={event => field.setValue(event.target.value)}
                      placeholder={field.placeholder}
                      className="mt-1 w-full text-sm normal-case tracking-normal border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0] font-serif"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-xs font-bold uppercase tracking-wider text-[#68635c]">
                  Service area
                  <input type="text" value={serviceArea} onChange={event => setServiceArea(event.target.value)} placeholder="e.g. Greater Toronto + remote" className="mt-1 w-full text-sm normal-case tracking-normal border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0] font-serif" />
                  <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-[#888]">Tell buyers where you can deliver or serve.</span>
                </label>
                <label className="flex items-start gap-3 text-sm font-serif text-[#333] sm:pt-5">
                  <input type="checkbox" checked={remoteAvailable} onChange={event => setRemoteAvailable(event.target.checked)} className="mt-1 accent-[#d71466]" />
                  <span><strong className="block text-xs uppercase tracking-wider text-[#68635c]">Remote delivery available</strong><span className="text-[11px] text-[#888]">Show a clear remote option on your public profile.</span></span>
                </label>
              </div>
              <label className="mt-6 flex items-start gap-3 text-sm font-serif text-[#333]">
                <input type="checkbox" checked={standardsAcknowledged} onChange={event => setStandardsAcknowledged(event.target.checked)} className="mt-1 accent-[#d71466]" />
                <span>I confirm that my listings, service area, availability, and contact information are accurate and that I will respond to community inquiries in good faith.</span>
              </label>
              <button
                type="button"
                className="mt-6 text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-3 rounded disabled:opacity-50"
                disabled={
                  saveProfileMutation.isPending || !profile?.businessName
                }
                onClick={() =>
                  saveProfileMutation.mutate({
                    businessName: profile?.businessName || "Vendor",
                    description: profile?.description || undefined,
                    location: profile?.location || undefined,
                    serviceArea: serviceArea || undefined,
                    remoteAvailable,
                    contactEmail: contactEmail || undefined,
                    website: website || undefined,
                    phone: phone || undefined,
                    whatsapp: whatsapp || undefined,
                    imessage: imessage || undefined,
                    instagram: instagram || undefined,
                    standardsAcknowledged,
                  })
                }
              >
                {saveProfileMutation.isPending
                  ? "Saving…"
                  : "Save contact settings"}
              </button>
            </div>
            <div className="bg-white border border-[#d9d0c4] p-6 rounded h-fit">
              <p className="text-xs font-bold uppercase tracking-widest text-[#d71466] mb-1">
                Notification settings
              </p>
              <h2 className="font-serif text-3xl font-bold text-[#0a0a0a] mb-2">
                Stay close to buyers.
              </h2>
              <p className="font-serif text-sm text-[#68635c] mb-6">
                Choose how KwantuHub alerts you about inquiries and account activity.
              </p>
              <NotificationPreferences />
            </div>
            <div className="bg-[#0a0a0a] text-[#f0e8dc] p-6 rounded h-fit">
              <p className="text-xs font-bold uppercase tracking-widest text-[#fe8129] mb-2">
                Trust by design
              </p>
              <h3 className="font-serif text-2xl font-bold mb-3">
                Contact is always vendor-controlled.
              </h3>
              <p className="font-serif text-sm text-[#c9bfb2] leading-relaxed">
                KwantuHub never exposes channels in public listing payloads. A
                buyer must request a reveal, and each reveal is rate-limited and
                recorded in your analytics.
              </p>
            </div>
            <div className="lg:col-span-2">
              <ContactVerification />
            </div>
            <div className="lg:col-span-2">
              <VendorVerificationCenter />
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
