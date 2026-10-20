import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

type AdminTab =
  | "overview"
  | "analytics"
  | "vendors"
  | "verification"
  | "users"
  | "listings"
  | "reviews"
  | "disputes"
  | "reports"
  | "categories"
  | "flags"
  | "notifications";

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [selectedReportInquiryId, setSelectedReportInquiryId] = useState<number | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<"all" | "open" | "reviewed" | "dismissed" | "actioned">("open");
  const [reportConversationStateFilter, setReportConversationStateFilter] = useState<"all" | "open" | "closed" | "archived">("all");
  const [reportBuyerFilter, setReportBuyerFilter] = useState("");
  const [reportVendorFilter, setReportVendorFilter] = useState("");
  const [reportListingFilter, setReportListingFilter] = useState("");
  const [reportFromFilter, setReportFromFilter] = useState("");
  const [verificationStatusFilter, setVerificationStatusFilter] = useState<string>("all");
  const [verificationCountryFilter, setVerificationCountryFilter] = useState<string>("all");
  const [verificationProviderFilter, setVerificationProviderFilter] = useState<string>("all");
  const [reportToFilter, setReportToFilter] = useState("");
  const [analyticsVendorFilter, setAnalyticsVendorFilter] = useState("");
  const [analyticsCategoryFilter, setAnalyticsCategoryFilter] = useState("");
  const [analyticsFromFilter, setAnalyticsFromFilter] = useState("");
  const [analyticsToFilter, setAnalyticsToFilter] = useState("");

  const adminEnabled = isAuthenticated && user?.role === "admin";
  const { data: pending, isLoading } = trpc.admin.pendingVendors.useQuery(
    undefined,
    { enabled: adminEnabled }
  );
  const { data: users } = trpc.admin.users.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "users",
  });
  const { data: listings } = trpc.admin.listings.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "listings",
  });
  const { data: adminReviews } = trpc.admin.reviews.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "reviews",
  });
  const updateReviewStatusMutation = trpc.admin.updateReviewStatus.useMutation({
    onSuccess: () => utils.admin.reviews.invalidate(),
  });
  const { data: categories } = trpc.admin.categories.useQuery(undefined, {
    enabled: adminEnabled && (activeTab === "categories" || activeTab === "analytics"),
  });
  const analyticsFilters = useMemo(() => ({
    vendorId: analyticsVendorFilter ? Number(analyticsVendorFilter) : undefined,
    categoryId: analyticsCategoryFilter ? Number(analyticsCategoryFilter) : undefined,
    from: analyticsFromFilter || undefined,
    to: analyticsToFilter || undefined,
  }), [analyticsVendorFilter, analyticsCategoryFilter, analyticsFromFilter, analyticsToFilter]);
  const { data: adminAnalytics } = trpc.admin.analytics.useQuery(analyticsFilters, {
    enabled: adminEnabled && activeTab === "analytics",
  });
  const { data: leadSummary } = trpc.admin.leadConversionSummary.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "analytics",
  });
  const { data: disputes } = trpc.admin.disputes.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "disputes",
  });
  const reportFilters = useMemo(() => ({
    status: reportStatusFilter === "all" ? undefined : reportStatusFilter,
    conversationState: reportConversationStateFilter === "all" ? undefined : reportConversationStateFilter,
    buyerId: reportBuyerFilter ? Number(reportBuyerFilter) : undefined,
    vendorId: reportVendorFilter ? Number(reportVendorFilter) : undefined,
    listingId: reportListingFilter ? Number(reportListingFilter) : undefined,
    from: reportFromFilter || undefined,
    to: reportToFilter || undefined,
  }), [reportStatusFilter, reportConversationStateFilter, reportBuyerFilter, reportVendorFilter, reportListingFilter, reportFromFilter, reportToFilter]);
  const { data: conversationReports } = trpc.admin.conversationReports.useQuery(reportFilters, {
    enabled: adminEnabled && activeTab === "reports",
  });
  const reportMessagesInput = useMemo(
    () => ({ inquiryId: selectedReportInquiryId || 1 }),
    [selectedReportInquiryId]
  );
  const { data: reportMessages } = trpc.admin.conversationMessages.useQuery(reportMessagesInput, {
    enabled: adminEnabled && activeTab === "reports" && selectedReportInquiryId !== null,
  });
  const { data: flags } = trpc.admin.featureFlags.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "flags",
  });
  const { data: notificationSummary } = trpc.admin.notificationDeliverySummary.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const { data: notificationDeliveries } = trpc.admin.notificationDeliveries.useQuery({}, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const { data: webhookEvents } = trpc.admin.notificationWebhookEvents.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const { data: suppressions } = trpc.admin.notificationSuppressions.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const { data: emailPauseStatus } = trpc.admin.emailDeliveryPause.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const setEmailDeliveryPausedMutation = trpc.admin.setEmailDeliveryPaused.useMutation({
    onSuccess: () => {
      utils.admin.emailDeliveryPause.invalidate();
      utils.admin.notificationDeliverySummary.invalidate();
    },
  });
  const requeueOutboxMutation = trpc.admin.requeueNotificationOutbox.useMutation({
    onSuccess: () => {
      utils.admin.notificationDeliverySummary.invalidate();
      utils.admin.notificationDeliveries.invalidate();
    },
  });
  const releaseSuppressionMutation = trpc.admin.releaseNotificationSuppression.useMutation({
    onSuccess: () => {
      utils.admin.notificationSuppressions.invalidate();
      utils.admin.notificationDeliverySummary.invalidate();
    },
  });
  const verificationFilters = useMemo(() => ({
    status: verificationStatusFilter === "all" ? undefined : (verificationStatusFilter as any),
    countryCode: verificationCountryFilter === "all" ? undefined : (verificationCountryFilter as any),
    provider: verificationProviderFilter === "all" ? undefined : (verificationProviderFilter as any),
  }), [verificationStatusFilter, verificationCountryFilter, verificationProviderFilter]);
  const { data: verificationSessions } = trpc.admin.verificationSessions.useQuery(verificationFilters, {
    enabled: adminEnabled && activeTab === "verification",
  });
  const reviewVerificationMutation = trpc.admin.reviewVerificationSession.useMutation({
    onSuccess: () => {
      utils.admin.verificationSessions.invalidate();
      utils.admin.pendingVendors.invalidate();
    },
  });

  const decideMutation = trpc.admin.decideVendor.useMutation({
    onSuccess: () => utils.admin.pendingVendors.invalidate(),
  });
  const escalateAccountMutation = trpc.admin.escalateAccount.useMutation({
    onSuccess: () => {
      utils.admin.users.invalidate();
      utils.admin.moderation.invalidate();
    },
  });
  const updateListingMutation = trpc.admin.updateListingStatus.useMutation({
    onSuccess: () => utils.admin.listings.invalidate(),
  });
  const updateDisputeMutation = trpc.admin.updateDispute.useMutation({
    onSuccess: () => utils.admin.disputes.invalidate(),
  });
  const updateConversationReportMutation = trpc.admin.updateConversationReport.useMutation({
    onSuccess: () => utils.admin.conversationReports.invalidate(),
  });
  const moderateMessageMutation = trpc.admin.moderateMessage.useMutation({
    onSuccess: () => utils.admin.conversationMessages.invalidate(),
  });
  const saveCategoryMutation = trpc.admin.saveCategory.useMutation({
    onSuccess: () => {
      utils.admin.categories.invalidate();
      setNewCategoryName("");
      setNewCategorySlug("");
    },
  });
  const flagMutation = trpc.admin.setFeatureFlag.useMutation({
    onSuccess: () => utils.admin.featureFlags.invalidate(),
  });
  const retryDeliveryMutation = trpc.admin.retryNotificationDelivery.useMutation({
    onSuccess: () => {
      utils.admin.notificationDeliveries.invalidate();
      utils.admin.notificationDeliverySummary.invalidate();
    },
  });

  if (!adminEnabled) {
    return (
      <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-20 text-center font-serif">
          <h2 className="text-3xl font-bold text-[#0a0a0a] mb-2">
            Administrator Access Required
          </h2>
          <p className="text-[#68635c]">
            You must be signed in as a platform administrator to view this
            portal.
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const tabs: Array<[AdminTab, string]> = [
    ["overview", "Overview"],
    ["analytics", "Analytics"],
    ["vendors", `Vendors (${pending?.length || 0})`],
    ["verification", `Verification (${verificationSessions?.length || 0})`],
    ["users", "Users"],
    ["listings", "Listings"],
    ["reviews", "Reviews & Integrity"],
    ["disputes", "Disputes"],
    ["reports", "Conversation reports"],
    ["categories", "Categories"],
    ["flags", "Feature flags"],
    ["notifications", "Notifications"],
  ];

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-8 py-12 w-full">
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] block mb-2">
            GOVERNANCE & TRUST
          </span>
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-[#0a0a0a]">
            Admin <span className="italic font-normal">control room.</span>
          </h1>
          <p className="text-[#68635c] font-serif mt-1">
            Manage vendors, marketplace content, users, categories, moderation,
            and controlled platform experiments.
          </p>
        </div>

        <div className="flex gap-5 overflow-x-auto border-b border-[#d9d0c4] mb-8">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`shrink-0 pb-3 text-xs font-bold uppercase tracking-wider border-b-2 ${activeTab === key ? "border-[#d71466] text-[#d71466]" : "border-transparent text-[#68635c]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <section className="space-y-6">
            <div className="portal-metrics">
              <div className="portal-metric">
                <strong>{pending?.length || 0}</strong>
                <span>Pending vendors</span>
              </div>
              <div className="portal-metric">
                <strong>Live</strong>
                <span>JWT security</span>
              </div>
              <div className="portal-metric">
                <strong>On</strong>
                <span>Audit logging</span>
              </div>
              <div className="portal-metric">
                <strong>Ready</strong>
                <span>Swagger API</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-[#d9d0c4] p-6 rounded">
                <h2 className="font-serif font-bold text-2xl mb-2">
                  Moderation queue
                </h2>
                <p className="font-serif text-[#68635c] mb-5">
                  Vendor approvals are the first trust checkpoint. Every
                  decision is recorded in the moderation audit log.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("vendors")}
                  className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-5 py-2.5 rounded"
                >
                  Review vendors →
                </button>
              </div>
              <div className="bg-[#0a0a0a] text-[#f0e8dc] p-6 rounded">
                <h2 className="font-serif font-bold text-2xl mb-2">
                  System controls
                </h2>
                <p className="font-serif text-[#c9bfb2] mb-5">
                  Use feature flags to release optional navigation or
                  marketplace modules without a code deployment.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("flags")}
                  className="text-xs font-bold uppercase tracking-wider text-[#0a0a0a] bg-[#f0e8dc] px-5 py-2.5 rounded"
                >
                  Manage flags →
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "analytics" && (
          <section className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#d71466]">PLATFORM INTELLIGENCE</p>
              <h2 className="font-serif text-3xl font-bold text-[#0a0a0a]">Inquiry funnel</h2>
              <p className="mt-1 font-serif text-sm text-[#68635c]">Aggregate discovery-to-resolution signals. Filters are admin-only and exclude message bodies and personally identifying buyer details.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 rounded border border-[#d9d0c4] bg-white p-4">
              <input value={analyticsVendorFilter} onChange={event => setAnalyticsVendorFilter(event.target.value)} placeholder="Vendor ID" inputMode="numeric" className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" />
              <select value={analyticsCategoryFilter} onChange={event => setAnalyticsCategoryFilter(event.target.value)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]"><option value="">All categories</option>{categories?.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              <input type="date" value={analyticsFromFilter} onChange={event => setAnalyticsFromFilter(event.target.value)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" aria-label="Analytics from date" />
              <input type="date" value={analyticsToFilter} onChange={event => setAnalyticsToFilter(event.target.value)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" aria-label="Analytics to date" />
            </div>
            <div className="portal-metrics">
              <div className="portal-metric"><strong>{adminAnalytics?.listingViews || 0}</strong><span>Listing views</span></div>
              <div className="portal-metric"><strong>{adminAnalytics?.contactReveals || 0}</strong><span>Contact reveals</span></div>
              <div className="portal-metric"><strong>{adminAnalytics?.inquiries || 0}</strong><span>Inquiries</span></div>
              <div className="portal-metric"><strong>{adminAnalytics?.replies || 0}</strong><span>Vendor replies</span></div>
              <div className="portal-metric"><strong>{adminAnalytics?.resolutions || 0}</strong><span>Resolutions</span></div>
              <div className="portal-metric"><strong>{adminAnalytics ? `${Math.round((adminAnalytics.resolutionRate || 0) * 100)}%` : "0%"}</strong><span>Resolution rate</span></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                ["Discovery → contact", adminAnalytics?.listingViews ? `${Math.round(((adminAnalytics.contactReveals || 0) / adminAnalytics.listingViews) * 100)}%` : "—"],
                ["Contact → inquiry", adminAnalytics?.contactReveals ? `${Math.round(((adminAnalytics.inquiries || 0) / adminAnalytics.contactReveals) * 100)}%` : "—"],
                ["Inquiry → reply", adminAnalytics?.inquiries ? `${Math.round(((adminAnalytics.replies || 0) / adminAnalytics.inquiries) * 100)}%` : "—"],
              ].map(([label, value]) => <div key={label} className="bg-white border border-[#d9d0c4] p-5 rounded"><p className="text-xs uppercase tracking-wider text-[#68635c]">{label}</p><strong className="mt-2 block font-serif text-3xl">{value}</strong></div>)}
            </div>

            {/* Aggregate Lead Conversion Funnel */}
            <div className="bg-white border border-[#d9d0c4] p-6 rounded space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-serif font-bold text-xl text-[#0a0a0a]">
                    Aggregate Vendor Lead Conversion Funnel
                  </h3>
                  <p className="text-xs text-[#68635c] font-serif mt-0.5">
                    Stage transitions from initial buyer inquiry to completed deal, excluding private vendor notes.
                  </p>
                </div>
                <strong className="text-sm uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded">
                  {Math.round((leadSummary?.conversionRate || 0) * 100)}% Overall Win Rate
                </strong>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
                  <p className="text-[10px] uppercase font-bold text-[#68635c]">New Inquiries</p>
                  <strong className="text-lg font-serif text-[#0a0a0a] block mt-1">{leadSummary?.counts.new_inquiry || 0}</strong>
                </div>
                <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
                  <p className="text-[10px] uppercase font-bold text-[#68635c]">Contacted</p>
                  <strong className="text-lg font-serif text-[#0a0a0a] block mt-1">{leadSummary?.counts.contacted || 0}</strong>
                </div>
                <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
                  <p className="text-[10px] uppercase font-bold text-[#68635c]">Quotes Sent</p>
                  <strong className="text-lg font-serif text-[#0a0a0a] block mt-1">{leadSummary?.counts.quote_sent || 0}</strong>
                </div>
                <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
                  <p className="text-[10px] uppercase font-bold text-emerald-800">Deals Won</p>
                  <strong className="text-lg font-serif text-emerald-800 block mt-1">{leadSummary?.counts.deal_won || 0}</strong>
                </div>
                <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
                  <p className="text-[10px] uppercase font-bold text-[#8c827a]">Deals Lost</p>
                  <strong className="text-lg font-serif text-[#8c827a] block mt-1">{leadSummary?.counts.deal_lost || 0}</strong>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "vendors" && (
          <section className="space-y-6">
            {isLoading ? (
              <div className="text-center py-12 font-serif text-[#68635c]">
                Loading pending applications...
              </div>
            ) : (pending?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-12 rounded text-center">
                <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-2">
                  Queue is clear
                </h3>
                <p className="text-[#68635c] font-serif">
                  No vendor applications are currently waiting for approval.
                </p>
              </div>
            ) : (
              pending?.map(({ vendor, user: vUser }) => (
                <div
                  key={vendor.id}
                  className="bg-white border border-[#d9d0c4] p-6 rounded shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6"
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded mb-2 inline-block">
                      Pending verification
                    </span>
                    <h3 className="font-serif font-bold text-2xl text-[#0a0a0a]">
                      {vendor.businessName}
                    </h3>
                    <p className="text-sm text-[#68635c] font-serif mt-1">
                      {vendor.description}
                    </p>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-[#888]">
                      <span>
                        Applicant: {vUser.name} ({vUser.email})
                      </span>
                      <span>
                        Location: {vendor.location || "North America"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        decideMutation.mutate({
                          vendorId: vendor.id,
                          status: "approved",
                        })
                      }
                      disabled={decideMutation.isPending}
                      className="text-xs font-bold uppercase tracking-wider text-white bg-green-700 px-5 py-2.5 rounded disabled:opacity-50"
                    >
                      Approve vendor
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        decideMutation.mutate({
                          vendorId: vendor.id,
                          status: "rejected",
                        })
                      }
                      disabled={decideMutation.isPending}
                      className="text-xs font-bold uppercase tracking-wider text-[#68635c] border border-[#d9d0c4] px-4 py-2.5 rounded disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === "verification" && (
          <section className="space-y-4">
            <div className="bg-white border border-[#d9d0c4] p-5 rounded">
              <h2 className="font-serif font-bold text-2xl text-[#0a0a0a]">
                Vendor Identity & Residence Queue
              </h2>
              <p className="text-xs text-[#68635c] font-serif mt-1">
                Review submitted Veriff, Sumsub, and manual proof-of-address documents for diaspora vendors in North America.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#eee8df]">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">Status</label>
                  <select
                    value={verificationStatusFilter}
                    onChange={e => setVerificationStatusFilter(e.target.value)}
                    className="w-full text-xs border border-[#d9d0c4] rounded px-2.5 py-1.5 bg-[#faf6f0]"
                  >
                    <option value="all">All statuses</option>
                    <option value="created">Created</option>
                    <option value="submitted">Submitted</option>
                    <option value="in_review">In Review</option>
                    <option value="approved">Approved</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">Country</label>
                  <select
                    value={verificationCountryFilter}
                    onChange={e => setVerificationCountryFilter(e.target.value)}
                    className="w-full text-xs border border-[#d9d0c4] rounded px-2.5 py-1.5 bg-[#faf6f0]"
                  >
                    <option value="all">All North America</option>
                    <option value="US">United States (US)</option>
                    <option value="CA">Canada (CA)</option>
                    <option value="MX">Mexico (MX)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">Provider</label>
                  <select
                    value={verificationProviderFilter}
                    onChange={e => setVerificationProviderFilter(e.target.value)}
                    className="w-full text-xs border border-[#d9d0c4] rounded px-2.5 py-1.5 bg-[#faf6f0]"
                  >
                    <option value="all">All providers</option>
                    <option value="veriff">Veriff</option>
                    <option value="sumsub">Sumsub</option>
                    <option value="manual">Manual Review</option>
                  </select>
                </div>
              </div>
            </div>

            {(verificationSessions?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-10 rounded text-center text-[#68635c] font-serif">
                No vendor verification sessions recorded yet.
              </div>
            ) : (
              verificationSessions?.map(({ session, vendor, applicant }) => (
                <div
                  key={session.id}
                  className="bg-white border border-[#d9d0c4] p-6 rounded space-y-4"
                >
                  <div className="flex flex-wrap justify-between items-start gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#fe8129] block mb-1">
                        {session.provider.toUpperCase()} · {session.sessionType.replace(/_/g, " ")}
                      </span>
                      <h3 className="font-serif font-bold text-2xl text-[#0a0a0a]">
                        {vendor.businessName}
                      </h3>
                      <p className="text-xs text-[#68635c] mt-1">
                        Applicant: <strong>{applicant.name}</strong> ({applicant.email}) · Country: <strong>{session.countryCode || "NA"}</strong>
                      </p>
                      <p className="text-xs text-[#8c827a] mt-0.5">
                        Session: <code className="bg-[#faf6f0] px-1 py-0.5 rounded text-[11px]">{session.providerSessionId || `#${session.id}`}</code> · Status: <span className="uppercase font-bold text-[#0a0a0a]">{session.status}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const notes = window.prompt("Approval notes (optional):") || undefined;
                          reviewVerificationMutation.mutate({
                            sessionId: session.id,
                            action: "approve",
                            reviewerNotes: notes,
                            countryCode: (session.countryCode as any) || "US",
                          });
                        }}
                        disabled={reviewVerificationMutation.isPending || session.status === "approved"}
                        className="text-xs font-bold uppercase tracking-wider text-white bg-green-700 px-4 py-2 rounded disabled:opacity-50"
                      >
                        Approve Verified
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt("Reason for declining:") || "Documentation insufficient";
                          reviewVerificationMutation.mutate({
                            sessionId: session.id,
                            action: "decline",
                            declinedReason: reason,
                          });
                        }}
                        disabled={reviewVerificationMutation.isPending || session.status === "declined"}
                        className="text-xs font-bold uppercase tracking-wider text-red-700 border border-red-200 px-4 py-2 rounded disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                  {session.reviewerNotes && (
                    <div className="p-3 bg-[#faf6f0] rounded text-xs text-[#68635c] font-serif">
                      <strong>Reviewer note:</strong> {session.reviewerNotes}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === "users" && (
          <section className="bg-white border border-[#d9d0c4] rounded overflow-hidden">
            <div className="p-5 border-b border-[#eee8df]">
              <h2 className="font-serif font-bold text-2xl">User accounts</h2>
            </div>
            <div className="divide-y divide-[#eee8df]">
              {users?.map(account => (
                <div
                  key={account.id}
                  className="p-4 flex flex-wrap justify-between gap-4 items-center"
                >
                  <div>
                    <strong className="font-serif">
                      {account.name || "Unnamed account"}
                    </strong>
                    <p className="text-xs text-[#68635c]">
                      {account.email} · {account.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt("Reason for this account escalation:");
                      if (reason?.trim()) {
                        escalateAccountMutation.mutate({
                          userId: account.id,
                          action: account.status === "active" ? "suspend" : "reinstate",
                          reason: reason.trim(),
                        });
                      }
                    }}
                    disabled={escalateAccountMutation.isPending}
                    className={`text-xs font-bold uppercase tracking-wider px-3 py-2 rounded ${account.status === "active" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
                  >
                    {account.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "listings" && (
          <section className="space-y-3">
            {listings?.map(({ listing, vendor, category, quality }) => (
              <div
                key={listing.id}
                className="bg-white border border-[#d9d0c4] p-5 rounded flex flex-wrap justify-between gap-4 items-center"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <strong className="font-serif text-lg">
                      {listing.title}
                    </strong>
                    {quality && (
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                        quality.level === "high"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : quality.level === "moderate"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-red-50 text-red-800 border-red-200"
                      }`}>
                        {quality.level} quality ({quality.score}/100)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#68635c]">
                    {vendor.businessName} · {category.name} · {listing.status}
                    {quality?.reasons?.length ? ` · Note: ${quality.reasons.join(", ")}` : ""}
                  </p>
                </div>
                <select
                  value={listing.status}
                  onChange={event =>
                    updateListingMutation.mutate({
                      listingId: listing.id,
                      status: event.target.value as
                        | "draft"
                        | "pending"
                        | "approved"
                        | "rejected"
                        | "published"
                        | "hidden"
                        | "archived",
                    })
                  }
                  className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]"
                >
                  <option value="draft">Draft</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            ))}
          </section>
        )}

        {activeTab === "reviews" && (
          <section className="space-y-4">
            <div className="bg-white border border-[#d9d0c4] p-5 rounded">
              <h2 className="font-serif font-bold text-2xl mb-1 text-[#0a0a0a]">
                Review Integrity & Moderation
              </h2>
              <p className="text-xs text-[#68635c] font-serif">
                Automated review risk heuristics detect bursts, duplicate text, and suspicious patterns. Decisions are audited.
              </p>
            </div>
            {(adminReviews?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-10 rounded text-center font-serif text-[#68635c]">
                No buyer reviews submitted yet.
              </div>
            ) : (
              adminReviews?.map(({ review, listing, buyer, integrity }) => (
                <div
                  key={review.id}
                  className={`p-5 rounded border ${
                    integrity?.isSuspicious
                      ? "bg-[#fffbf0] border-amber-300"
                      : "bg-white border-[#d9d0c4]"
                  } space-y-3`}
                >
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="font-serif text-lg text-[#0a0a0a]">
                          ★ {review.rating}/5 on {listing.title}
                        </strong>
                        {integrity?.isSuspicious && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                            Flagged for Review
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#68635c] mt-0.5 font-serif">
                        By {buyer.name || buyer.email} · Status: <strong>{review.status}</strong>
                      </p>
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-sm font-serif text-[#0a0a0a] bg-[#faf6f0] p-3 rounded border border-[#eee8df]">
                      "{review.comment}"
                    </p>
                  )}
                  {integrity?.flags?.length ? (
                    <div className="text-xs text-amber-800 font-serif">
                      <strong>Signals:</strong> {integrity.flags.join(", ")}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3 pt-1 border-t border-[#eee8df]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
                      Action:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateReviewStatusMutation.mutate({
                          reviewId: review.id,
                          status: "approved",
                        })
                      }
                      disabled={updateReviewStatusMutation.isPending || review.status === "approved"}
                      className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 hover:underline disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateReviewStatusMutation.mutate({
                          reviewId: review.id,
                          status: "rejected",
                          reason: "Flagged by integrity heuristic / administrative decision",
                        })
                      }
                      disabled={updateReviewStatusMutation.isPending || review.status === "rejected"}
                      className="text-[11px] font-bold uppercase tracking-wider text-red-700 hover:underline disabled:opacity-40"
                    >
                      Dismiss / Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === "disputes" && (
          <section className="space-y-3">
            {(disputes?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-10 rounded text-center">
                <h3 className="font-serif font-bold text-2xl mb-2">
                  No disputes recorded
                </h3>
                <p className="font-serif text-[#68635c]">
                  Buyer and Vendor cases will appear here for review.
                </p>
              </div>
            ) : (
              disputes?.map(({ dispute, listing, vendor, buyer }) => (
                <div
                  key={dispute.id}
                  className="bg-white border border-[#d9d0c4] p-5 rounded space-y-3"
                >
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#d71466]">
                        Case #{dispute.id}
                      </span>
                      <h3 className="font-serif font-bold text-xl">
                        {dispute.subject}
                      </h3>
                      <p className="text-xs text-[#68635c]">
                        {buyer.name || buyer.email} · {vendor.businessName}
                        {listing ? ` · ${listing.title}` : ""}
                      </p>
                    </div>
                    <select
                      value={dispute.status}
                      onChange={event =>
                        updateDisputeMutation.mutate({
                          disputeId: dispute.id,
                          status: event.target.value as
                            | "open"
                            | "in_review"
                            | "resolved"
                            | "rejected",
                        })
                      }
                      className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]"
                    >
                      <option value="open">Open</option>
                      <option value="in_review">In review</option>
                      <option value="resolved">Resolved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <p className="font-serif text-sm text-[#68635c]">
                    {dispute.description}
                  </p>
                  {dispute.resolution && (
                    <p className="text-xs text-[#68635c] border-t border-[#eee8df] pt-3">
                      Resolution: {dispute.resolution}
                    </p>
                  )}
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === "reports" && (
          <section className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#d71466]">MODERATION QUEUE</p>
              <h2 className="font-serif text-3xl font-bold text-[#0a0a0a]">Conversation reports</h2>
              <p className="mt-1 font-serif text-sm text-[#68635c]">Review participant reports, inspect the full message trail, hide harmful messages, and record a resolution.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 rounded border border-[#d9d0c4] bg-white p-4">
              <select value={reportStatusFilter} onChange={event => setReportStatusFilter(event.target.value as typeof reportStatusFilter)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]"><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option><option value="actioned">Actioned</option><option value="all">All statuses</option></select>
              <select value={reportConversationStateFilter} onChange={event => setReportConversationStateFilter(event.target.value as typeof reportConversationStateFilter)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]"><option value="all">All conversation states</option><option value="open">Open</option><option value="closed">Resolved</option><option value="archived">Archived</option></select>
              <input value={reportBuyerFilter} onChange={event => setReportBuyerFilter(event.target.value)} placeholder="Buyer ID" inputMode="numeric" className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" />
              <input value={reportVendorFilter} onChange={event => setReportVendorFilter(event.target.value)} placeholder="Vendor ID" inputMode="numeric" className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" />
              <input value={reportListingFilter} onChange={event => setReportListingFilter(event.target.value)} placeholder="Listing ID" inputMode="numeric" className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" />
              <input type="date" value={reportFromFilter} onChange={event => setReportFromFilter(event.target.value)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" aria-label="Reports from date" />
              <input type="date" value={reportToFilter} onChange={event => setReportToFilter(event.target.value)} className="text-xs border border-[#d9d0c4] rounded px-2 py-2 bg-[#faf6f0]" aria-label="Reports to date" />
            </div>
            {(conversationReports?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-10 rounded text-center font-serif text-[#68635c]">No conversation reports in the queue.</div>
            ) : (
              conversationReports?.map(({ report, inquiry, listing, reporter }) => (
                <div key={report.id} className="bg-white border border-[#d9d0c4] p-5 rounded space-y-4">
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#d71466]">Report #{report.id} · {report.status}</span>
                      <h3 className="font-serif font-bold text-xl">{inquiry.subject}</h3>
                      <p className="text-xs text-[#68635c]">{listing.title} · {reporter.name || reporter.email} · inquiry #{inquiry.id}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedReportInquiryId(inquiry.id)}
                      className="h-fit rounded border border-[#d71466] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#d71466]"
                    >
                      Inspect messages
                    </button>
                  </div>
                  <div className="rounded bg-[#faf6f0] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#68635c]">Reason</p>
                    <p className="mt-1 font-serif text-sm text-[#333]">{report.reason}</p>
                    {report.details && <p className="mt-2 text-sm text-[#68635c]">{report.details}</p>}
                    {report.linkedDisputeId && <p className="mt-2 text-xs text-[#68635c]">Linked dispute #{report.linkedDisputeId}</p>}
                  </div>
                  {report.status === "open" && (
                    <div className="flex flex-wrap gap-3">
                      {(["reviewed", "dismissed", "actioned"] as const).map(status => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => {
                            const resolutionNote = window.prompt(`Resolution note for ${status} report:`) || undefined;
                            const suspendConversation = status === "actioned" && window.confirm("Archive this conversation for both participants?");
                            const disputeValue = window.prompt("Optional existing dispute ID to link:");
                            updateConversationReportMutation.mutate({
                              reportId: report.id,
                              status,
                              resolutionNote,
                              suspendConversation,
                              linkedDisputeId: disputeValue?.trim() ? Number(disputeValue) : undefined,
                            });
                          }}
                          disabled={updateConversationReportMutation.isPending}
                          className={`rounded px-3 py-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 ${status === "actioned" ? "bg-[#d71466] text-white" : "border border-[#d9d0c4] text-[#68635c]"}`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {selectedReportInquiryId !== null && (
              <div className="bg-[#0a0a0a] text-[#f0e8dc] border border-[#0a0a0a] p-5 rounded space-y-3">
                <div className="flex justify-between items-center gap-4">
                  <h3 className="font-serif font-bold text-2xl">Message moderation</h3>
                  <button type="button" onClick={() => setSelectedReportInquiryId(null)} className="text-xs uppercase tracking-wider text-[#f0e8dc] hover:text-[#fe8129]">Close</button>
                </div>
                {(reportMessages || []).map(({ message, sender }) => (
                  <div key={message.id} className="rounded bg-[#1b1b1b] p-3 flex flex-wrap justify-between gap-4 items-start">
                    <div className={message.isHidden ? "opacity-50" : ""}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#fe8129]">{sender.name || sender.email}</p>
                      <p className="mt-1 font-serif text-sm">{message.body}</p>
                      {message.isHidden && <p className="mt-1 text-[10px] uppercase tracking-wider text-[#fe8129]">Hidden from participants</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => moderateMessageMutation.mutate({ messageId: message.id, hidden: !message.isHidden, reason: message.isHidden ? undefined : "Hidden during conversation report review" })}
                      disabled={moderateMessageMutation.isPending}
                      className="rounded border border-[#fe8129] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#fe8129] disabled:opacity-50"
                    >
                      {message.isHidden ? "Restore" : "Hide message"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "categories" && (
          <section className="space-y-5">
            <div className="bg-white border border-[#d9d0c4] p-5 rounded">
              <h2 className="font-serif font-bold text-2xl mb-4">
                Add category
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={newCategoryName}
                  onChange={event => setNewCategoryName(event.target.value)}
                  placeholder="Category name"
                  className="text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                />
                <input
                  value={newCategorySlug}
                  onChange={event => setNewCategorySlug(event.target.value)}
                  placeholder="category-slug"
                  className="text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                />
                <button
                  type="button"
                  onClick={() =>
                    saveCategoryMutation.mutate({
                      name: newCategoryName,
                      slug: newCategorySlug,
                      sortOrder: (categories?.length || 0) + 1,
                      isActive: true,
                    })
                  }
                  disabled={!newCategoryName || !newCategorySlug}
                  className="text-xs font-bold uppercase tracking-wider text-white brand-gradient rounded"
                >
                  Create category
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories?.map(category => (
                <div
                  key={category.id}
                  className="bg-white border border-[#d9d0c4] p-4 rounded flex justify-between items-center"
                >
                  <div>
                    <strong className="font-serif">{category.name}</strong>
                    <p className="text-xs text-[#68635c]">
                      /{category.slug} · order {category.sortOrder}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      saveCategoryMutation.mutate({
                        id: category.id,
                        name: category.name,
                        slug: category.slug,
                        sortOrder: category.sortOrder,
                        isActive: !category.isActive,
                      })
                    }
                    className={`text-xs font-bold uppercase tracking-wider ${category.isActive ? "text-green-700" : "text-[#68635c]"}`}
                  >
                    {category.isActive ? "Visible" : "Hidden"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "notifications" && (
          <section className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#d71466]">Delivery operations</p>
              <div className="flex flex-wrap items-center justify-between gap-4 mt-1">
                <h2 className="font-serif text-3xl font-bold text-[#0a0a0a]">Notification health</h2>
                <button
                  type="button"
                  onClick={() => {
                    const currentlyPaused = emailPauseStatus?.paused === true;
                    const reason = window.prompt(
                      currentlyPaused ? "Reason for resuming email delivery:" : "Reason for pausing transactional email delivery:"
                    );
                    if (reason?.trim()) {
                      setEmailDeliveryPausedMutation.mutate({ paused: !currentlyPaused, reason: reason.trim() });
                    }
                  }}
                  disabled={setEmailDeliveryPausedMutation.isPending}
                  className={`rounded px-4 py-2 text-xs font-bold uppercase tracking-wider ${
                    emailPauseStatus?.paused
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "border border-[#d9d0c4] bg-white text-[#68635c] hover:text-[#0a0a0a]"
                  }`}
                >
                  {emailPauseStatus?.paused ? "Email Delivery Paused (Resume)" : "Pause Email Delivery"}
                </button>
              </div>
              <p className="mt-1 font-serif text-sm text-[#68635c]">Monitor provider delivery, webhook reconciliation, and suppressed recipients without exposing message bodies.</p>
            </div>
            <div className="portal-metrics">
              <div className="portal-metric"><strong>{notificationSummary?.failedOutbox || 0}</strong><span>Failed/dead outbox</span></div>
              <div className="portal-metric"><strong>{notificationSummary?.webhookFailures || 0}</strong><span>Webhook failures</span></div>
              <div className="portal-metric"><strong>{suppressions?.length || 0}</strong><span>Active suppressions</span></div>
              <div className="portal-metric"><strong>{notificationDeliveries?.length || 0}</strong><span>Recent deliveries</span></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-[#d9d0c4] rounded overflow-hidden">
                <div className="border-b border-[#eee8df] p-5"><h3 className="font-serif text-2xl font-bold">Delivery status</h3></div>
                <div className="divide-y divide-[#eee8df]">
                  {(notificationSummary?.byStatus || []).map(item => (
                    <div key={item.status} className="flex justify-between px-5 py-3 text-sm"><span className="font-serif capitalize">{item.status}</span><strong>{item.count}</strong></div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-[#d9d0c4] rounded overflow-hidden">
                <div className="border-b border-[#eee8df] p-5"><h3 className="font-serif text-2xl font-bold">Active suppressions</h3></div>
                <div className="divide-y divide-[#eee8df]">
                  {(suppressions || []).slice(0, 6).map(item => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 text-sm">
                      <div>
                        <p className="truncate font-serif">{item.email}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#d71466]">{item.reason}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const releaseReason = window.prompt("Reason for releasing suppression (e.g. user updated address / provider resolved bounce):");
                          if (releaseReason?.trim()) {
                            releaseSuppressionMutation.mutate({ suppressionId: item.id, releaseReason: releaseReason.trim() });
                          }
                        }}
                        disabled={releaseSuppressionMutation.isPending}
                        className="rounded border border-[#d9d0c4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#68635c] hover:text-[#0a0a0a] disabled:opacity-50"
                      >
                        Release
                      </button>
                    </div>
                  ))}
                  {!suppressions?.length && <p className="px-5 py-6 font-serif text-sm text-[#68635c]">No active suppressions.</p>}
                </div>
              </div>
            </div>
            <div className="bg-white border border-[#d9d0c4] rounded overflow-hidden">
              <div className="border-b border-[#eee8df] p-5"><h3 className="font-serif text-2xl font-bold">Recent delivery attempts</h3></div>
              <div className="divide-y divide-[#eee8df]">
                {(notificationDeliveries || []).slice(0, 12).map(({ delivery, recipientEmail }) => (
                  <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="font-serif font-bold">{recipientEmail || `User #${delivery.recipientUserId}`}</p>
                      <p className="text-xs text-[#68635c]">{delivery.channel} · {delivery.provider || "internal"} · {delivery.status}</p>
                      {delivery.failureReason && <p className="mt-1 text-xs text-red-700">{delivery.failureReason}</p>}
                    </div>
                    {(delivery.status === "failed" || delivery.status === "bounced" || delivery.status === "complained") && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => retryDeliveryMutation.mutate({ deliveryId: delivery.id })} disabled={retryDeliveryMutation.isPending} className="rounded border border-[#d71466] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#d71466] disabled:opacity-50">Retry delivery</button>
                        {delivery.outboxId && (
                          <button
                            type="button"
                            onClick={() => requeueOutboxMutation.mutate({ outboxId: delivery.outboxId! })}
                            disabled={requeueOutboxMutation.isPending}
                            className="rounded border border-[#68635c] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#68635c] hover:text-[#0a0a0a] disabled:opacity-50"
                          >
                            Requeue outbox
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {!notificationDeliveries?.length && <p className="px-5 py-6 font-serif text-sm text-[#68635c]">No delivery attempts recorded yet.</p>}
              </div>
            </div>
            <div className="bg-white border border-[#d9d0c4] rounded overflow-hidden">
              <div className="border-b border-[#eee8df] p-5"><h3 className="font-serif text-2xl font-bold">Webhook reconciliation</h3></div>
              <div className="divide-y divide-[#eee8df]">
                {(webhookEvents || []).slice(0, 8).map(event => (
                  <div key={event.id} className="flex flex-wrap justify-between gap-3 px-5 py-3 text-sm"><span className="font-serif">{event.providerEventType} · {event.providerMessageId || "no message id"}</span><span className={`text-[10px] font-bold uppercase tracking-wider ${event.processingStatus === "failed" ? "text-red-700" : "text-[#68635c]"}`}>{event.processingStatus}</span></div>
                ))}
                {!webhookEvents?.length && <p className="px-5 py-6 font-serif text-sm text-[#68635c]">No provider webhook events received.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "flags" && (
          <section className="space-y-3">
            {flags?.map(flag => (
              <div
                key={flag.id}
                className="bg-white border border-[#d9d0c4] p-5 rounded flex justify-between items-center"
              >
                <div>
                  <strong className="font-serif">{flag.settingKey}</strong>
                  <p className="text-xs text-[#68635c]">{flag.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    flagMutation.mutate({
                      settingKey: flag.settingKey,
                      booleanValue: !flag.booleanValue,
                    })
                  }
                  className={`text-xs font-bold uppercase tracking-wider px-3 py-2 rounded ${flag.booleanValue ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}
                >
                  {flag.booleanValue ? "Enabled" : "Disabled"}
                </button>
              </div>
            ))}
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
