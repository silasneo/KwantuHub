import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

type AdminTab =
  | "overview"
  | "vendors"
  | "users"
  | "listings"
  | "disputes"
  | "categories"
  | "flags";

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");

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
  const { data: categories } = trpc.admin.categories.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "categories",
  });
  const { data: disputes } = trpc.admin.disputes.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "disputes",
  });
  const { data: flags } = trpc.admin.featureFlags.useQuery(undefined, {
    enabled: adminEnabled && activeTab === "flags",
  });

  const decideMutation = trpc.admin.decideVendor.useMutation({
    onSuccess: () => utils.admin.pendingVendors.invalidate(),
  });
  const updateUserMutation = trpc.admin.updateUserStatus.useMutation({
    onSuccess: () => utils.admin.users.invalidate(),
  });
  const updateListingMutation = trpc.admin.updateListingStatus.useMutation({
    onSuccess: () => utils.admin.listings.invalidate(),
  });
  const updateDisputeMutation = trpc.admin.updateDispute.useMutation({
    onSuccess: () => utils.admin.disputes.invalidate(),
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
    ["vendors", `Vendors (${pending?.length || 0})`],
    ["users", "Users"],
    ["listings", "Listings"],
    ["disputes", "Disputes"],
    ["categories", "Categories"],
    ["flags", "Feature flags"],
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
                    onClick={() =>
                      updateUserMutation.mutate({
                        userId: account.id,
                        status:
                          account.status === "active" ? "suspended" : "active",
                      })
                    }
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
            {listings?.map(({ listing, vendor, category }) => (
              <div
                key={listing.id}
                className="bg-white border border-[#d9d0c4] p-5 rounded flex flex-wrap justify-between gap-4 items-center"
              >
                <div>
                  <strong className="font-serif text-lg">
                    {listing.title}
                  </strong>
                  <p className="text-xs text-[#68635c]">
                    {vendor.businessName} · {category.name} · {listing.status}
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
