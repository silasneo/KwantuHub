import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { PhoneCountrySettings } from "@/components/PhoneCountrySettings";
import { EmailPolicySettings } from "@/components/EmailPolicySettings";
import { useDashboardTab } from "@/hooks/useDashboardTab";
import { PortalRequestStatus } from "@/components/PortalRequestStatus";
import { HeroSlideSettings } from "@/components/HeroSlideSettings";
import { AdminListingEditor } from "@/components/AdminListingEditor";
import { AdminShell, type AdminNavGroup } from "@/components/AdminShell";
import {
  BarChart3, Bell, Flag, Image as ImageIcon, LayoutDashboard, MailCheck, Package, Scale,
  ShieldCheck, Smartphone, Star, Store, Tags, ToggleRight, Users,
} from "lucide-react";

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
  | "sms-countries"
  | "email-policy"
  | "notifications";
type ListingStatus = "draft" | "pending" | "approved" | "rejected" | "published" | "hidden" | "archived";

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { activeTab, setActiveTab, inquiryId } = useDashboardTab<AdminTab | "site-content">(["overview", "analytics", "vendors", "verification", "users", "listings", "reviews", "disputes", "reports", "categories", "flags", "sms-countries", "email-policy", "notifications", "site-content"], "overview");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryPage, setDirectoryPage] = useState(1);
  const [accountRole, setAccountRole] = useState<"buyer" | "vendor" | "admin" | "">("");
  const [accountStatus, setAccountStatus] = useState<"active" | "suspended" | "">("");
  const [vendorStatus, setVendorStatus] = useState<"pending" | "approved" | "rejected" | "suspended" | "">("");
  const [listingStatus, setListingStatus] = useState<ListingStatus | "">("");
  const [editingListingId, setEditingListingId] = useState<number>();
  const [editingCategoryId, setEditingCategoryId] = useState<number>();
  const [categoryOrder, setCategoryOrder] = useState(0);
  const [mergeTargetId, setMergeTargetId] = useState("");
  useEffect(() => { setDirectoryPage(1); }, [activeTab, directoryQuery, accountRole, accountStatus, vendorStatus, listingStatus]);
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
  useEffect(() => {
    if (!inquiryId) return;
    setSelectedReportInquiryId(inquiryId);
    setReportStatusFilter("all");
  }, [inquiryId]);

  const adminEnabled = isAuthenticated && user?.role === "admin";
  const overview = trpc.admin.overview.useQuery(undefined, { enabled: adminEnabled, staleTime: 60_000 });
  const { data: pending, isLoading, error: pendingError } = trpc.admin.pendingVendors.useQuery(
    { query: directoryQuery, page: directoryPage, status: vendorStatus || undefined },
    { enabled: adminEnabled && activeTab === "vendors" }
  );
  const { data: users, error: usersError, isLoading: usersLoading } = trpc.admin.users.useQuery({ query: directoryQuery, page: directoryPage, role: accountRole || undefined, status: accountStatus || undefined }, {
    enabled: adminEnabled && activeTab === "users",
  });
  const { data: listings, error: listingsError, isLoading: listingsLoading } = trpc.admin.listings.useQuery({ query: directoryQuery, page: directoryPage, status: listingStatus || undefined }, {
    enabled: adminEnabled && activeTab === "listings",
  });
  const { data: adminReviews, error: reviewsError } = trpc.admin.reviews.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "reviews",
  });
  const updateReviewStatusMutation = trpc.admin.updateReviewStatus.useMutation({
    onSuccess: () => utils.admin.reviews.invalidate(),
  });
  const { data: categories, error: categoriesError } = trpc.admin.categories.useQuery(undefined, {
    enabled: adminEnabled && (activeTab === "categories" || activeTab === "analytics" || activeTab === "listings"),
  });
  const analyticsFilters = useMemo(() => ({
    vendorId: analyticsVendorFilter ? Number(analyticsVendorFilter) : undefined,
    categoryId: analyticsCategoryFilter ? Number(analyticsCategoryFilter) : undefined,
    from: analyticsFromFilter || undefined,
    to: analyticsToFilter || undefined,
  }), [analyticsVendorFilter, analyticsCategoryFilter, analyticsFromFilter, analyticsToFilter]);
  const { data: adminAnalytics, error: analyticsError } = trpc.admin.analytics.useQuery(analyticsFilters, {
    enabled: adminEnabled && activeTab === "analytics",
  });
  const exportReport = trpc.admin.exportReport.useMutation({
    onSuccess: result => {
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = result.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const { data: leadSummary, error: leadError } = trpc.admin.leadConversionSummary.useQuery(analyticsFilters, {
    enabled: adminEnabled && activeTab === "analytics",
  });
  const { data: disputes, error: disputesError } = trpc.admin.disputes.useQuery(undefined, {
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
  const { data: conversationReports, error: reportsError } = trpc.admin.conversationReports.useQuery(reportFilters, {
    enabled: adminEnabled && activeTab === "reports",
  });
  const reportMessagesInput = useMemo(
    () => ({ inquiryId: selectedReportInquiryId || 1 }),
    [selectedReportInquiryId]
  );
  const { data: reportMessages, error: messagesError } = trpc.admin.conversationMessages.useQuery(reportMessagesInput, {
    enabled: adminEnabled && activeTab === "reports" && selectedReportInquiryId !== null,
  });
  const { data: flags, error: flagsError } = trpc.admin.featureFlags.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "flags",
  });
  const { data: notificationSummary, error: notificationError } = trpc.admin.notificationDeliverySummary.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const { data: notificationDeliveries, error: deliveriesError } = trpc.admin.notificationDeliveries.useQuery({}, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const { data: webhookEvents, error: webhooksError } = trpc.admin.notificationWebhookEvents.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const { data: suppressions, error: suppressionsError } = trpc.admin.notificationSuppressions.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "notifications",
  });
  const { data: emailPauseStatus, error: pauseError } = trpc.admin.emailDeliveryPause.useQuery(undefined, {
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
  const { data: verificationSessions, error: verificationError } = trpc.admin.verificationSessions.useQuery(verificationFilters, {
    enabled: adminEnabled && activeTab === "verification",
  });
  const reviewVerificationMutation = trpc.admin.reviewVerificationSession.useMutation({
    onSuccess: () => {
      utils.admin.verificationSessions.invalidate();
      utils.admin.pendingVendors.invalidate();
    },
  });
  const { data: retentionStatus, error: retentionError } = trpc.admin.evidenceRetentionStatus.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "verification",
  });
  const evidenceHoldMutation = trpc.admin.setEvidenceLegalHold.useMutation({
    onSuccess: () => { utils.admin.verificationSessions.invalidate(); utils.admin.evidenceRetentionStatus.invalidate(); },
  });

  const decideMutation = trpc.admin.decideVendor.useMutation({
    onSuccess: () => utils.admin.pendingVendors.invalidate(),
  });
  const resetAccountMutation = trpc.admin.requestAccountReset.useMutation();
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
      setEditingCategoryId(undefined);
    },
  });
  const removeCategory = trpc.admin.removeCategory.useMutation({
    onSuccess: () => { utils.admin.categories.invalidate(); utils.categories.list.invalidate(); utils.admin.listings.invalidate(); },
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

  const navGroups: AdminNavGroup<AdminTab | "site-content">[] = [
    { title: "Dashboard", items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard },
      { key: "analytics", label: "Analytics", icon: BarChart3 },
    ] },
    { title: "Marketplace", items: [
      { key: "vendors", label: "Vendors", icon: Store, badge: overview.data?.pending || 0 },
      { key: "listings", label: "Listings", icon: Package },
      { key: "categories", label: "Categories", icon: Tags },
      { key: "site-content", label: "Site content", icon: ImageIcon },
    ] },
    { title: "Trust & safety", items: [
      { key: "verification", label: "Verification", icon: ShieldCheck, badge: verificationSessions?.length || 0 },
      { key: "users", label: "Users", icon: Users },
      { key: "reviews", label: "Reviews & integrity", icon: Star },
      { key: "disputes", label: "Disputes", icon: Scale },
      { key: "reports", label: "Conversation reports", icon: Flag },
    ] },
    { title: "Platform", items: [
      { key: "flags", label: "Feature flags", icon: ToggleRight },
      { key: "sms-countries", label: "SMS countries", icon: Smartphone },
      { key: "email-policy", label: "Email screening", icon: MailCheck },
      { key: "notifications", label: "Notifications", icon: Bell },
    ] },
  ];

  return (
    <AdminShell groups={navGroups} active={activeTab} onSelect={setActiveTab}>

        <PortalRequestStatus
          queries={[overview.error, pendingError, usersError, listingsError, reviewsError, categoriesError, analyticsError, leadError, disputesError, reportsError, messagesError, flagsError, notificationError, deliveriesError, webhooksError, suppressionsError, pauseError, verificationError].map(error => ({ error }))}
          mutations={[exportReport, removeCategory, updateReviewStatusMutation, setEmailDeliveryPausedMutation, requeueOutboxMutation, releaseSuppressionMutation, reviewVerificationMutation, decideMutation, resetAccountMutation, escalateAccountMutation, updateListingMutation, updateDisputeMutation, updateConversationReportMutation, moderateMessageMutation, saveCategoryMutation, flagMutation, retryDeliveryMutation]}
          onRetry={() => { utils.admin.invalidate(); }} />
        {(isLoading || usersLoading || listingsLoading) && <p role="status">Loading administration data…</p>}
        {activeTab === "site-content" && <HeroSlideSettings />}
        {["users", "vendors", "listings"].includes(activeTab) && <section aria-label="Directory filters" className="bg-white border p-4 rounded mb-4 space-y-3">
          <label className="block">Search name, email or listing title
            <input className="border p-2 ml-2" value={directoryQuery} maxLength={160} onChange={event => setDirectoryQuery(event.target.value)} />
          </label>
          {activeTab === "users" && <>
            <label>Role <select value={accountRole} onChange={event => setAccountRole(event.target.value as typeof accountRole)}><option value="">All roles</option><option value="buyer">Buyer</option><option value="vendor">Vendor</option><option value="admin">Admin</option></select></label>{" "}
            <label>Status <select value={accountStatus} onChange={event => setAccountStatus(event.target.value as typeof accountStatus)}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
            <p className="text-sm">Administrator grants/revocations use the audited provisioning command. Vendor roles come from completed onboarding, not manual role changes.</p>
          </>}
          {activeTab === "vendors" && <label>Status <select value={vendorStatus} onChange={event => setVendorStatus(event.target.value as typeof vendorStatus)}><option value="">All statuses</option>{["pending", "approved", "rejected", "suspended"].map(status => <option key={status}>{status}</option>)}</select></label>}
          {activeTab === "listings" && <label>Status <select value={listingStatus} onChange={event => setListingStatus(event.target.value as typeof listingStatus)}><option value="">All statuses</option>{["draft", "pending", "approved", "rejected", "published", "hidden", "archived"].map(status => <option key={status}>{status}</option>)}</select></label>}
          <div className="flex gap-4 items-center">
            <button disabled={directoryPage === 1} onClick={() => setDirectoryPage(page => page - 1)}>Previous</button>
            <span>Page {directoryPage} (up to 25 results)</span>
            <button disabled={directoryPage >= 2000 || (activeTab === "users" ? users?.length : activeTab === "vendors" ? pending?.length : listings?.length) !== 25}
              onClick={() => setDirectoryPage(page => page + 1)}>Next</button>
          </div>
        </section>}
        {activeTab === "overview" && (
          <section className="space-y-6">
            <div className="portal-metrics">
              <div className="portal-metric">
                <strong>{overview.data?.pending ?? "—"}</strong>
                <span>Pending vendors</span>
              </div>
              <div className="portal-metric">
                <strong>{overview.data?.users ?? "—"}</strong>
                <span>Accounts</span>
              </div>
              <div className="portal-metric">
                <strong>{overview.data?.vendors ?? "—"}</strong>
                <span>Vendors</span>
              </div>
              <div className="portal-metric">
                <strong>{overview.data?.listings ?? "—"}</strong>
                <span>Listings</span>
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
              <button disabled={exportReport.isPending} onClick={() => exportReport.mutate(analyticsFilters)} className="border p-2 mt-3">Download aggregate CSV</button>
              <p className="text-sm mt-2">Responses count distinct inquiries created in the selected period, with replies up to its end date. Closed counts reflect current state. Event ratios below are not tracked-user conversion rates and can exceed 100%.</p>
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
              <div className="portal-metric"><strong>{adminAnalytics?.replies || 0}</strong><span>Responded inquiries</span></div>
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
            {decideMutation.error && <p role="alert" className="form-error">{decideMutation.error.message}</p>}
            {isLoading ? (
              <div className="text-center py-12 font-serif text-[#68635c]">
                Loading vendor accounts...
              </div>
            ) : (pending?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-12 rounded text-center">
                <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-2">
                  Queue is clear
                </h3>
                <p className="text-[#68635c] font-serif">
                  No vendors have started onboarding.
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
                      {vendor.approvalStatus === "approved" ? "Active" : vendor.approvalStatus}
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
                    <details className="text-sm mt-3"><summary>Vendor details</summary>
                      <p>Vendor ID: {vendor.id} · Account ID: {vUser.id} · Account: {vUser.status}</p>
                      <p>Identity: {vendor.identityStatus} · Residence: {vendor.residenceStatus} ({vendor.residenceCountry || "not established"})</p>
                      <p>Service area: {vendor.serviceArea || "Not provided"}</p>
                      <p>Business email: {vendor.contactEmail || "Not provided"} · Phone: {vendor.phone || "Not provided"}</p>
                      <p>Re-enabling cannot bypass account or vendor onboarding requirements.</p>
                    </details>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const reason = window.prompt("Reason for re-enabling this vendor:");
                        if (reason) decideMutation.mutate({ vendorId: vendor.id, status: "approved", reason });
                      }}
                      disabled={decideMutation.isPending || vendor.approvalStatus === "approved"}
                      className="text-xs font-bold uppercase tracking-wider text-white bg-green-700 px-5 py-2.5 rounded disabled:opacity-50"
                    >
                      Re-enable vendor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = window.prompt("Reason for suspending this vendor:");
                        if (reason) decideMutation.mutate({ vendorId: vendor.id, status: "suspended", reason });
                      }}
                      disabled={decideMutation.isPending}
                      className="text-xs font-bold uppercase tracking-wider text-[#68635c] border border-[#d9d0c4] px-4 py-2.5 rounded disabled:opacity-50"
                    >
                      Suspend
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
                    <option value="didit">Didit</option>
                    <option value="veriff">Veriff</option>
                    <option value="sumsub">Sumsub</option>
                    <option value="manual">Manual Review</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#d9d0c4] rounded p-4 text-xs space-y-2">
              <strong>Evidence retention: physical deletion disabled</strong>
              <p>{retentionStatus?.reason || "Retention periods and legal-hold rules await approval. Expired download access does not delete stored evidence."}</p>
              <p>Expired evidence inventory (first 100): {retentionStatus?.expired.length ?? "Loading"}. Legal holds remain audited and do not restore expired download access.</p>
              {(retentionError || evidenceHoldMutation.error) && <p role="alert" className="form-error">{retentionError?.message || evidenceHoldMutation.error?.message}</p>}
            </div>
            {(verificationSessions?.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-10 rounded text-center text-[#68635c] font-serif">
                No vendor verification sessions recorded yet.
              </div>
            ) : (
              verificationSessions?.map(({ session, vendor, applicant, evidence, decisions }) => (
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
                    {(session.sessionType === "combined_na_vendor" ? ["identity", "residence"] as const :
                      session.sessionType === "identity_document" ? ["identity"] as const :
                      session.sessionType === "proof_of_residence" ? ["residence"] as const : []).map(checkType => (
                    <div key={checkType} className="space-y-2">
                      <p className="text-xs font-bold capitalize">{checkType}: {decisions.find(decision => decision.checkType === checkType)?.outcome || "Undecided"}</p>
                      <button
                        type="button"
                        onClick={() => {
                          const notes = window.prompt("Record what each requested check and its documents establish:");
                          if (!notes?.trim()) return;
                          reviewVerificationMutation.mutate({
                            sessionId: session.id,
                            action: "approve",
                            checkType,
                            reviewerNotes: notes,
                            countryCode: session.countryCode === "US" || session.countryCode === "CA" || session.countryCode === "MX" ? session.countryCode : undefined,
                          });
                        }}
                        disabled={reviewVerificationMutation.isPending || session.provider !== "manual" || decisions.some(decision => decision.checkType === checkType) ||
                          !["created", "submitted", "in_review"].includes(session.status) || !session.expiresAt || new Date(session.expiresAt) <= new Date()}
                        className="text-xs font-bold uppercase tracking-wider text-white bg-green-700 px-4 py-2 rounded disabled:opacity-50"
                      >
                        Approve check
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt("Reason for declining (shown to the vendor):");
                          if (!reason?.trim()) return;
                          reviewVerificationMutation.mutate({
                            sessionId: session.id,
                            action: "decline",
                            checkType,
                            declinedReason: reason,
                          });
                        }}
                        disabled={reviewVerificationMutation.isPending || session.provider !== "manual" || decisions.some(decision => decision.checkType === checkType) ||
                          !["created", "submitted", "in_review"].includes(session.status) || !session.expiresAt || new Date(session.expiresAt) <= new Date()}
                        className="text-xs font-bold uppercase tracking-wider text-red-700 border border-red-200 px-4 py-2 rounded disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                    ))}
                    </div>
                    {session.provider !== "manual" && <p className="text-xs">Hosted results are authoritative through signed provider callbacks. Manual approval is unavailable.</p>}
                  </div>
                  {session.reviewerNotes && (
                    <div className="p-3 bg-[#faf6f0] rounded text-xs text-[#68635c] font-serif">
                      <strong>Reviewer note:</strong> {session.reviewerNotes}
                    </div>
                  )}
                  {evidence.length > 0 && (
                    <div className="border-t border-[#eee8df] pt-3 space-y-2">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
                        Private supporting documents
                      </h4>
                      {evidence.map(item => (
                        <div key={item.id} className="space-y-1">
                        {item.signedUrl ? <a
                          href={item.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs text-[#d71466] underline"
                        >
                          {item.evidenceType.replace(/_/g, " ")} — {item.summary || "Open document"}
                        </a> : <p className="text-xs text-[#68635c]">
                          {item.evidenceType.replace(/_/g, " ")} — evidence retention expired; download unavailable.
                        </p>}
                        <p className="text-xs">{item.legalHoldAt ? `Legal hold: ${item.legalHoldReason}` : "No legal hold"}</p>
                        <button className="text-xs underline" disabled={evidenceHoldMutation.isPending} onClick={() => {
                          const reason = window.prompt(item.legalHoldAt ? "Reason for releasing legal hold:" : "Reason for legal hold:");
                          if (reason?.trim()) evidenceHoldMutation.mutate({ evidenceId: item.id, held: !item.legalHoldAt, reason });
                        }}>{item.legalHoldAt ? "Release legal hold" : "Set legal hold"}</button>
                        </div>
                      ))}
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
              {resetAccountMutation.error && <p role="alert" className="form-error">{resetAccountMutation.error.message}</p>}
              {resetAccountMutation.data && <p role="status">{resetAccountMutation.data.message}</p>}
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
                    <details className="text-sm mt-2"><summary>Account details</summary>
                      <p>ID: {account.id} · Status: {account.status} · Intent: {account.signupIntent}</p>
                      <p>Email verified: {account.emailVerifiedAt ? new Date(account.emailVerifiedAt).toLocaleString() : "No"}</p>
                      <p>Phone verified: {account.phoneVerifiedAt ? new Date(account.phoneVerifiedAt).toLocaleString() : "No"}</p>
                      <p>Created: {new Date(account.createdAt).toLocaleString()} · Last sign-in: {new Date(account.lastSignedIn).toLocaleString()}</p>
                    </details>
                  </div>
                  <button type="button" className="text-xs underline" disabled={resetAccountMutation.isPending || account.status !== "active"}
                    onClick={() => { if (window.confirm(`Send a password recovery link to ${account.email}?`)) resetAccountMutation.mutate({ userId: account.id }); }}>
                    Send recovery link
                  </button>
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
                    disabled={escalateAccountMutation.isPending || account.id === user.id}
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
                  <a className="text-sm underline mr-4" href={`/listings/${listing.slug}?preview=1`} target="_blank" rel="noreferrer">Preview</a>
                  <button className="text-sm underline" onClick={() => setEditingListingId(listing.id)}>Edit metadata</button>
                </div>
                <select
                  aria-label={`Status for ${listing.title}`}
                  value={listing.status}
                  onChange={event => {
                    const reason = window.prompt("Reason for changing listing status:");
                    if (!reason?.trim()) return;
                    updateListingMutation.mutate({
                      listingId: listing.id,
                      reason: reason.trim(),
                      status: event.target.value as
                        | "draft"
                        | "pending"
                        | "approved"
                        | "rejected"
                        | "published"
                        | "hidden"
                        | "archived",
                    });
                  }}
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
        {editingListingId && listings?.find(item => item.listing.id === editingListingId) && <AdminListingEditor
          key={editingListingId}
          listing={listings.find(item => item.listing.id === editingListingId)!.listing}
          categories={categories ?? []} onClose={() => setEditingListingId(undefined)} />}

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
                            const suspendConversation = status === "actioned" && window.confirm("Restrict this conversation for both participants? Only a moderator can restore it.");
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
                  {inquiry.moderatorSuspendedAt && <div className="border border-amber-300 bg-amber-50 p-3 text-sm">
                    <p>Conversation restricted by a moderator. Participant archive/unarchive cannot remove this restriction.</p>
                    <button type="button" className="underline" disabled={updateConversationReportMutation.isPending}
                      onClick={() => {
                        const resolutionNote = window.prompt("Reason for restoring this conversation:");
                        if (!resolutionNote?.trim()) return;
                        updateConversationReportMutation.mutate({ reportId: report.id, status: report.status === "open" ? "reviewed" : report.status, resumeConversation: true, resolutionNote: resolutionNote.trim() });
                      }}>Restore conversation access</button>
                  </div>}
                </div>
              ))
            )}
            {selectedReportInquiryId !== null && (
              <div id={`inquiry-${selectedReportInquiryId}`} tabIndex={-1} className="bg-[#0a0a0a] text-[#f0e8dc] border border-[#0a0a0a] p-5 rounded space-y-3">
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
                {editingCategoryId ? "Edit category" : "Add category"}
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
                      id: editingCategoryId,
                      sortOrder: categoryOrder,
                      isActive: categories?.find(category => category.id === editingCategoryId)?.isActive ?? true,
                    })
                  }
                  disabled={!newCategoryName || !newCategorySlug}
                  className="text-xs font-bold uppercase tracking-wider text-white brand-gradient rounded"
                >
                  {editingCategoryId ? "Save category" : "Create category"}
                </button>
              </div>
              <label className="block mt-3">Order <input type="number" min={0} max={10000} value={categoryOrder} onChange={event => setCategoryOrder(Number(event.target.value))} /></label>
              {editingCategoryId && <button onClick={() => { setEditingCategoryId(undefined); setNewCategoryName(""); setNewCategorySlug(""); }}>Cancel editing</button>}
              <label className="block mt-3">Merge target (for referenced categories)
                <select value={mergeTargetId} onChange={event => setMergeTargetId(event.target.value)}>
                  <option value="">No merge — delete only if unused</option>
                  {categories?.filter(category => category.isActive).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
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
                    <button className="text-sm underline mr-3" onClick={() => {
                      setEditingCategoryId(category.id); setNewCategoryName(category.name); setNewCategorySlug(category.slug); setCategoryOrder(category.sortOrder);
                    }}>Edit name / slug / order</button>
                    <button className="text-sm underline text-red-700" disabled={removeCategory.isPending} onClick={() => {
                      const reason = window.prompt(mergeTargetId ? `Merge ${category.name} into the selected target and remove its old URL? Enter reason:` : `Delete unused category ${category.name}? Enter reason:`);
                      if (reason?.trim()) removeCategory.mutate({ categoryId: category.id, mergeIntoId: mergeTargetId ? Number(mergeTargetId) : undefined, reason });
                    }}>{mergeTargetId ? "Merge into target" : "Delete if unused"}</button>
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
                    {delivery.failureCode === "send_outcome_unknown" ? (
                      <div className="space-y-2 text-xs">
                        <p>Unknown provider outcome. Check SendPulse before authorizing any resend.</p>
                        <div className="flex gap-3">
                          {(["sent", "not_sent"] as const).map(outcome => <button key={outcome} className="underline" disabled={retryDeliveryMutation.isPending} onClick={() => {
                            const providerMessageId = outcome === "sent" ? window.prompt("Confirmed SendPulse message ID:") : undefined;
                            if (outcome === "sent" && !providerMessageId?.trim()) return;
                            const notes = window.prompt(outcome === "sent" ? "Record how you confirmed provider acceptance:" : "Confirm SendPulse did NOT accept this message. Record your checks before authorizing resend:");
                            if (!notes?.trim()) return;
                            retryDeliveryMutation.mutate({ deliveryId: delivery.id, reconciliation: { outcome, notes, ...(providerMessageId ? { providerMessageId } : {}) } });
                          }}>{outcome === "sent" ? "Confirm sent (do not resend)" : "Confirm not sent and retry"}</button>)}
                        </div>
                      </div>
                    ) : delivery.status === "failed" && delivery.failureCode !== "send_in_progress" && (
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

        {activeTab === "sms-countries" && <PhoneCountrySettings />}
        {activeTab === "email-policy" && <EmailPolicySettings />}
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
    </AdminShell>
  );
}
