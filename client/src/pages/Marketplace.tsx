import { useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { mediaUrl } from "@/lib/storage";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { validateDiscoveryBounds, type DiscoveryCurrency } from "@shared/discoveryFilters";
import { marketplaceFilterUrl } from "@shared/discoveryNavigation";

export default function MarketplacePage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);

  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();

  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const type = searchParams.get("type") || "all";
  const location = searchParams.get("location") || "";
  const minPrice = searchParams.get("min") || "";
  const maxPrice = searchParams.get("max") || "";
  const remoteOnly = searchParams.get("remote") === "true";
  const verifiedOnly = searchParams.get("verified") === "true";
  const page = Number(searchParams.get("page") || "1");
  const sort = searchParams.get("sort") || "newest";
  const currency = searchParams.get("currency") || "USD";
  const updateFilter = (key: string, value: string, resetPage = true) => {
    navigate(marketplaceFilterUrl(searchString, key, value, resetPage));
  };
  const setQ = (value: string) => updateFilter("q", value);
  const setCategory = (value: string) => updateFilter("category", value);
  const setType = (value: string) => updateFilter("type", value === "all" ? "" : value);
  const setLocation = (value: string) => updateFilter("location", value);
  const setMinPrice = (value: string) => updateFilter("min", value);
  const setMaxPrice = (value: string) => updateFilter("max", value);
  const setRemoteOnly = (value: boolean) => updateFilter("remote", value ? "true" : "");
  const setVerifiedOnly = (value: boolean) => updateFilter("verified", value ? "true" : "");
  const setPage = (value: number) => updateFilter("page", value > 1 ? String(value) : "", false);
  const setSort = (value: string) => updateFilter("sort", value === "newest" ? "" : value);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: categories, error: categoryError } = trpc.categories.list.useQuery();
  let filterError = "";
  try {
    validateDiscoveryBounds({ minPrice: minPrice ? Number(minPrice) : undefined, maxPrice: maxPrice ? Number(maxPrice) : undefined });
    if (!Number.isSafeInteger(page) || page < 1 || !/^[1-9]\d*$/.test(searchParams.get("page") || "1")) throw new Error("Page must be a positive whole number.");
    if (!["all", "product", "service"].includes(type)) throw new Error("Select a valid offering type.");
    if (!["newest", "oldest", "title", "price_low", "price_high"].includes(sort)) throw new Error("Select a valid sort order.");
    if (!["USD", "CAD"].includes(currency)) throw new Error("Select USD or CAD; currencies are not converted.");
    for (const key of ["remote", "verified"]) {
      if (searchParams.has(key) && !["true", "false"].includes(searchParams.get(key)!)) throw new Error(`Invalid ${key} filter.`);
    }
    if (category && categories && !categories.some(item => item.slug === category)) throw new Error("Unknown category. Choose a category or clear filters.");
  } catch (error) { filterError = error instanceof Error ? error.message : "Invalid filters."; }

  const { data, isLoading, error, refetch } = trpc.marketplace.search.useQuery({
    q: q || undefined,
    category: category || undefined,
    type: type !== "all" ? type as "product" | "service" : undefined,
    location: location || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    remote: remoteOnly || undefined,
    verified: verifiedOnly || undefined,
    currency: currency as DiscoveryCurrency,
    sort: sort as "newest" | "oldest" | "title" | "price_low" | "price_high",
    page,
    pageSize: 12,
  }, { enabled: !filterError });

  const toggleWishlist = trpc.buyer.toggleWishlist.useMutation({
    onSuccess: () => {
      utils.buyer.wishlist.invalidate();
    },
  });

  const clearFilters = () => navigate("/marketplace");

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-8 py-10 w-full">
        {/* Market Intro matching Prototype */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#68635c] block mb-2">
              MARKETPLACE / NORTH AMERICA
            </span>
            <h1 className="text-4xl sm:text-6xl font-serif font-bold text-[#0a0a0a] leading-none">
              Find what carries{" "}
              <span className="italic font-normal">home forward.</span>
            </h1>
          </div>
          <p className="text-base sm:text-lg font-serif text-[#68635c] max-w-xs leading-snug">
            Browse goods and services from the vendors already shaping the
            KwantuHub community.
          </p>
        </div>

        {/* Layout: Sticky Left Filter + Right Masonry Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 items-start">
          {/* Floating Sticky Left Filter */}
          <aside className="bg-white border border-[#d9d0c4] p-5 rounded sticky top-28 shadow-xs space-y-5">
            <div className="flex justify-between items-center border-b border-[#eee8df] pb-3">
              <h2 className="font-serif font-bold text-2xl text-[#0a0a0a]">
                Filters
              </h2>
              <button
                onClick={clearFilters}
                className="text-[10px] font-bold uppercase tracking-wider text-[#d71466] hover:underline cursor-pointer"
              >
                Clear all
              </button>
            </div>

            {/* Type Switch */}
            <div>
              <div className="grid grid-cols-3 border border-[#0a0a0a] rounded overflow-hidden">
                <button
                  onClick={() => setType("all")}
                  className={`py-2 text-[10px] font-bold uppercase border-r border-[#0a0a0a] transition cursor-pointer ${
                    type === "all"
                      ? "bg-[#0a0a0a] text-white"
                      : "bg-white text-[#0a0a0a]"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setType("product")}
                  className={`py-2 text-[10px] font-bold uppercase border-r border-[#0a0a0a] transition cursor-pointer ${
                    type === "product"
                      ? "bg-[#0a0a0a] text-white"
                      : "bg-white text-[#0a0a0a]"
                  }`}
                >
                  Products
                </button>
                <button
                  onClick={() => setType("service")}
                  className={`py-2 text-[10px] font-bold uppercase transition cursor-pointer ${
                    type === "service"
                      ? "bg-[#0a0a0a] text-white"
                      : "bg-white text-[#0a0a0a]"
                  }`}
                >
                  Services
                </button>
              </div>
            </div>

            {/* Keyword Search */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Search
              </label>
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Keywords, fabrics, spices..."
                className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            {/* Categories */}
            <div className="pt-3 border-t border-[#eee8df]">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#68635c] mb-3">
                Categories
              </h3>
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                <button
                  onClick={() => setCategory("")}
                  className={`w-full text-left py-1 text-sm font-serif flex justify-between cursor-pointer ${
                    !category
                      ? "text-[#d71466] font-bold"
                      : "text-[#0a0a0a] hover:text-[#d71466]"
                  }`}
                >
                  <span>All Categories</span>
                </button>
                {categories?.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() =>
                      setCategory(category === cat.slug ? "" : cat.slug)
                    }
                    className={`w-full text-left py-1 text-sm font-serif flex justify-between cursor-pointer ${
                      category === cat.slug
                        ? "text-[#d71466] font-bold"
                        : "text-[#0a0a0a] hover:text-[#d71466]"
                    }`}
                  >
                    <span className="line-clamp-1">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="pt-3 border-t border-[#eee8df]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                City / Location
              </label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Houston, Toronto, Chicago"
                className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            {/* Price Range */}
            <div className="pt-3 border-t border-[#eee8df]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Price range (overlapping offers)
              </label>
              <select aria-label="Price currency" value={currency} onChange={event => updateFilter("currency", event.target.value)} className="w-full border rounded p-2 mb-2 text-xs">
                <option value="USD">USD — US dollars</option><option value="CAD">CAD — Canadian dollars</option>
              </select>
              <p className="text-xs mb-2">No currency conversion. Bare $ prices mean USD. “Inquire” and other nonnumeric prices are excluded when a price bound is set.</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minPrice}
                  onChange={e => setMinPrice(e.target.value)}
                  placeholder="Min"
                  className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={maxPrice}
                  onChange={e => setMaxPrice(e.target.value)}
                  placeholder="Max"
                  className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
                />
              </div>
            </div>

            {/* Trust Checkbox */}
            <div className="pt-3 border-t border-[#eee8df]">
              <label className="flex items-start gap-2 cursor-pointer text-xs font-serif text-[#333]">
                <input
                  type="checkbox"
                  checked={remoteOnly}
                  onChange={e => setRemoteOnly(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Offers remote / virtual delivery</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer text-xs font-serif text-[#333] mt-3">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={e => setVerifiedOnly(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Identity-verified vendors only (not administrator approval or contact verification)</span>
              </label>
            </div>
          </aside>

          {/* Right Listings Column */}
          <div>
            {(filterError || error || categoryError || toggleWishlist.error) && <div role="alert" className="mb-5 border border-red-300 p-4 text-red-800">
              <p>{filterError || error?.message || categoryError?.message || toggleWishlist.error?.message}</p>
              <button className="underline mr-4" onClick={clearFilters}>Clear filters</button>
              {!filterError && <button className="underline" onClick={() => refetch()}>Retry search</button>}
            </div>}
            {/* Toolbar */}
            <div className="bg-white border border-[#d9d0c4] p-4 rounded mb-6 flex flex-wrap justify-between items-center gap-4 shadow-xs">
              <span className="font-serif text-base text-[#0a0a0a]">
                Showing <b>{data?.items.length || 0}</b> community offerings
              </span>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#68635c]">Sort:</span>
                  <select
                    value={sort}
                    onChange={e => setSort(e.target.value as any)}
                    className="border border-[#d9d0c4] rounded px-2.5 py-1 text-xs bg-[#faf6f0] font-semibold"
                  >
                    <option value="newest">Newest additions</option>
                    <option value="oldest">Oldest</option>
                    <option value="title">Title A–Z</option>
                    <option value="price_low">Lowest price first ({currency} only)</option>
                    <option value="price_high">Highest price first ({currency} only)</option>
                  </select>
                </div>

                <div className="flex border border-[#d9d0c4] rounded overflow-hidden">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`px-2.5 py-1 text-xs font-bold ${
                      viewMode === "grid"
                        ? "bg-[#0a0a0a] text-white"
                        : "bg-white text-[#0a0a0a]"
                    }`}
                  >
                    ▦
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`px-2.5 py-1 text-xs font-bold ${
                      viewMode === "list"
                        ? "bg-[#0a0a0a] text-white"
                        : "bg-white text-[#0a0a0a]"
                    }`}
                  >
                    ☷
                  </button>
                </div>
              </div>
            </div>

            {/* Active Pills */}
            {(category ||
              type !== "all" ||
              location ||
              minPrice ||
              maxPrice ||
              remoteOnly ||
              verifiedOnly) && (
              <div className="flex flex-wrap gap-2 mb-6">
                {type !== "all" && (
                  <span className="bg-[#0a0a0a] text-[#f0e8dc] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5">
                    Type: {type}
                    <button
                      onClick={() => setType("all")}
                      className="cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {category && (
                  <span className="bg-[#0a0a0a] text-[#f0e8dc] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5">
                    {category}
                    <button
                      onClick={() => setCategory("")}
                      className="cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {location && (
                  <span className="bg-[#0a0a0a] text-[#f0e8dc] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5">
                    {location}
                    <button
                      onClick={() => setLocation("")}
                      className="cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {(minPrice || maxPrice) && (
                  <span className="bg-[#0a0a0a] text-[#f0e8dc] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5">
                    {currency} {minPrice || "0"}–{maxPrice || "∞"}
                    <button
                      onClick={() => {
                        const params = new URLSearchParams(searchString); params.delete("min"); params.delete("max"); params.delete("page"); navigate(`/marketplace?${params}`);
                      }}
                      className="cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {remoteOnly && (
                  <span className="bg-[#0a0a0a] text-[#f0e8dc] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5">
                    Remote only
                    <button
                      onClick={() => setRemoteOnly(false)}
                      className="cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {verifiedOnly && (
                  <span className="bg-[#0a0a0a] text-[#f0e8dc] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5">
                    Identity verified
                    <button onClick={() => setVerifiedOnly(false)} className="cursor-pointer">×</button>
                  </span>
                )}
              </div>
            )}

            {/* Results Grid */}
            {filterError || error || categoryError ? null : isLoading ? (
              <div className="text-center py-20 text-[#68635c] font-serif text-lg">
                Loading community offerings...
              </div>
            ) : (data?.items.length || 0) === 0 ? (
              <div className="bg-white border border-[#d9d0c4] p-12 rounded text-center">
                <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] mb-2">
                  {page > 1 ? "No listings on this page" : "No listings meet those filters"}
                </h3>
                <p className="text-[#68635c] font-serif mb-6">
                  {page > 1 ? "Results may have changed. Return to the first page without losing your filters." : "Try clearing a category or broadening your search terms."}
                </p>
                {page > 1 && <button className="underline mr-4" onClick={() => setPage(1)}>Return to first page</button>}
                <button
                  onClick={clearFilters}
                  className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-2.5 rounded cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            ) : viewMode === "grid" ? (
              /* Masonry-Style Cards matching Prototype */
              <div className="columns-1 sm:columns-2 md:columns-3 gap-5">
                {data?.items.map(item => (
                  <Link
                    key={item.id}
                    href={`/listings/${item.slug}`}
                    className="group inline-block w-full mb-5 break-inside-avoid bg-white border border-[#d9d0c4] rounded overflow-hidden shadow-xs hover:border-[#d71466] hover:shadow-md transition"
                  >
                    <div>
                      <div className="h-48 bg-[#0a0a0a] relative overflow-hidden">
                        {item.media?.[0]?.url ? (
                          <img
                            src={mediaUrl(item.media[0].storageKey || item.media[0].url)}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                          />
                        ) : (
                          <div className="w-full h-full brand-gradient opacity-90 flex items-center justify-center p-4 text-center">
                            <span className="font-serif text-white font-bold text-lg">
                              {item.title}
                            </span>
                          </div>
                        )}
                        <span className="absolute top-2.5 left-2.5 text-[9px] font-bold uppercase tracking-wider bg-white/95 text-[#0a0a0a] px-2 py-0.5 rounded">
                          {item.listingType}
                        </span>
                        {item.location && (
                          <span className="absolute bottom-2.5 left-2.5 text-[9px] font-bold bg-[#f0e8dc]/95 text-[#0a0a0a] px-2 py-0.5 rounded">
                            ⌖ {item.location}
                          </span>
                        )}
                        {isAuthenticated && (
                          <button
                            type="button"
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!user?.emailVerifiedAt) navigate(`/verify-account?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                              else toggleWishlist.mutate({ listingId: item.id });
                            }}
                            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 text-[#0a0a0a] hover:text-[#d71466] flex items-center justify-center text-xs shadow-xs"
                            title="Save listing"
                          >
                            ♡
                          </button>
                        )}
                      </div>

                      <div className="p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#d71466] block mb-1">
                          {item.category.name}
                        </span>
                        <h3 className="font-serif font-bold text-xl text-[#0a0a0a] group-hover:text-[#d71466] transition line-clamp-1 mb-1.5">
                          {item.title}
                        </h3>
                        <p className="text-xs text-[#68635c] font-serif line-clamp-2 leading-relaxed mb-3">
                          {item.description}
                        </p>
                        <span className="text-base font-bold font-serif text-[#0a0a0a] block mb-1">
                          {item.priceIndication || "Inquire"}
                        </span>
                        <p className="text-xs text-[#68635c] font-serif">
                          {item.vendor.businessName}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 pt-0">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#d71466] border-b border-[#0a0a0a] pb-0.5 inline-block">
                        View details →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              /* List View */
              <div className="space-y-4">
                {data?.items.map(item => (
                  <Link
                    key={item.id}
                    href={`/listings/${item.slug}`}
                    className="group bg-white border border-[#d9d0c4] rounded p-5 shadow-xs hover:border-[#d71466] transition flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between"
                  >
                    <div className="flex gap-4 items-center">
                      <div className="w-28 h-28 rounded bg-[#0a0a0a] overflow-hidden shrink-0">
                        {item.media?.[0]?.url ? (
                          <img
                            src={mediaUrl(item.media[0].storageKey || item.media[0].url)}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full brand-gradient" />
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#d71466] block mb-1">
                          {item.category.name} · {item.listingType}
                        </span>
                        <h3 className="font-serif font-bold text-2xl text-[#0a0a0a] group-hover:text-[#d71466] transition">
                          {item.title}
                        </h3>
                        <p className="text-xs text-[#68635c] font-serif line-clamp-1 mt-1 max-w-xl">
                          {item.description}
                        </p>
                        <span className="text-xs text-[#888] font-serif block mt-1">
                          {item.vendor.businessName} · {item.location}
                        </span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-0 border-[#eee8df]">
                      <span className="font-bold font-serif text-xl text-[#0a0a0a]">
                        {item.priceIndication || "Inquire"}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#d71466] sm:mt-2">
                        View details →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {!filterError && !error && ((data?.pagination?.totalPages || 1) > 1 || page > 1) && (
              <div className="flex items-center justify-between border-t border-[#d9d0c4] mt-8 pt-5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(Math.max(1, page - 1))}
                  className="text-xs font-bold uppercase tracking-wider text-[#d71466] disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-xs font-serif text-[#68635c]">
                  Page {data?.pagination.page || page} of {data?.pagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  disabled={page >= (data?.pagination?.totalPages || 1)}
                  onClick={() => setPage(page + 1)}
                  className="text-xs font-bold uppercase tracking-wider text-[#d71466] disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
