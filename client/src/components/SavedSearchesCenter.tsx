import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { CollectionPager } from "@/components/CollectionPager";
import {
  validateDiscoveryBounds,
  type DiscoveryCurrency,
} from "@shared/discoveryFilters";

export function SavedSearchesCenter() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const {
    data,
    isLoading,
    error,
    refetch,
  } = trpc.buyer.savedSearches.useQuery({ page });
  const searches = data?.items;
  const { data: categories, error: categoryError } =
    trpc.categories.list.useQuery();

  const [newName, setNewName] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | undefined>(
    undefined
  );
  const [newListingType, setNewListingType] = useState<
    "product" | "service" | undefined
  >(undefined);
  const [newLocation, setNewLocation] = useState("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [newFrequency, setNewFrequency] = useState<
    "immediate" | "daily" | "off"
  >("off");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [verifiedVendorOnly, setVerifiedVendorOnly] = useState(false);
  const [currency, setCurrency] = useState<DiscoveryCurrency>("USD");
  let boundsError = "";
  try {
    validateDiscoveryBounds({
      categoryId: newCategoryId,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    });
  } catch (error) {
    boundsError =
      error instanceof Error ? error.message : "Invalid price bounds.";
  }

  const createMutation = trpc.buyer.createSavedSearch.useMutation({
    onSuccess: () => {
      utils.buyer.savedSearches.invalidate();
      setNewName("");
      setNewQuery("");
      setNewCategoryId(undefined);
      setNewListingType(undefined);
      setNewLocation("");
      setMinPrice("");
      setMaxPrice("");
    },
  });

  const updateMutation = trpc.buyer.updateSavedSearch.useMutation({
    onSuccess: () => utils.buyer.savedSearches.invalidate(),
  });

  const deleteMutation = trpc.buyer.deleteSavedSearch.useMutation({
    onSuccess: () => utils.buyer.savedSearches.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="bg-white border border-[#d9d0c4] p-6 rounded animate-pulse">
        <div className="h-4 bg-[#f0e8dc] w-1/4 mb-3 rounded"></div>
        <div className="h-10 bg-[#f0e8dc] w-full rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#d9d0c4] p-6 rounded space-y-6">
      {(error ||
        categoryError ||
        createMutation.error ||
        updateMutation.error ||
        deleteMutation.error ||
        boundsError) && (
        <div role="alert" className="form-error">
          <p>
            {boundsError ||
              error?.message ||
              categoryError?.message ||
              createMutation.error?.message ||
              updateMutation.error?.message ||
              deleteMutation.error?.message}
          </p>
          {(error || categoryError) && (
            <button
              className="underline"
              onClick={() => {
                refetch();
                utils.categories.list.invalidate();
              }}
            >
              Retry loading
            </button>
          )}
        </div>
      )}
      <div>
        <h3 className="font-serif font-bold text-xl text-[#0a0a0a] mb-1">
          Saved Searches & Discovery Alerts
        </h3>
        <p className="text-xs text-[#68635c] font-serif">
          Save your favourite marketplace search criteria across keywords,
          categories, locations, and prices. Opt in to immediate or daily alerts
          when matching diaspora offerings are published.
        </p>
        <p className="text-xs text-[#68635c]">
          Email is separately opt-in under{" "}
          <Link href="/account?tab=settings" className="underline">
            notification settings
          </Link>
          . Daily digests include up to 20 recent matches once per 24 hours.
          Resuming a paused search does not backfill publications made while
          paused; previously recorded alerts may still arrive.
        </p>
      </div>

      {/* Quick Add Form */}
      <div className="p-4 bg-[#faf6f0] border border-[#eee8df] rounded space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#0a0a0a]">
          Save a New Search
        </h4>
        <label className="block text-xs">
          Price currency
          <select
            value={currency}
            onChange={event =>
              setCurrency(event.target.value as DiscoveryCurrency)
            }
            className="ml-2 border p-1"
          >
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
          </select>
        </label>
        <p className="text-xs">
          Numeric bounds match overlapping price ranges in this currency only.
          Bare $ means USD; no conversion is applied.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
              Search Name *
            </label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Authentic Kente Cloth"
              className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
              Keywords
            </label>
            <input
              type="text"
              value={newQuery}
              onChange={e => setNewQuery(e.target.value)}
              placeholder="e.g. kente, ankara, shea butter"
              className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
              Category
            </label>
            <select
              value={newCategoryId || ""}
              onChange={e =>
                setNewCategoryId(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              className="w-full text-xs border border-[#d9d0c4] rounded px-2.5 py-1.5 bg-white"
            >
              <option value="">All Categories</option>
              {(categories || []).map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
              Offering Type
            </label>
            <select
              value={newListingType || ""}
              onChange={e =>
                setNewListingType((e.target.value as any) || undefined)
              }
              className="w-full text-xs border border-[#d9d0c4] rounded px-2.5 py-1.5 bg-white"
            >
              <option value="">All Types</option>
              <option value="product">Products</option>
              <option value="service">Services</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
              Location / City
            </label>
            <input
              type="text"
              value={newLocation}
              onChange={e => setNewLocation(e.target.value)}
              placeholder="e.g. Toronto, Atlanta, CDMX"
              className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-1.5 bg-white"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Min ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                placeholder="0"
                className="w-full text-xs border border-[#d9d0c4] rounded px-2 py-1.5 bg-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Max ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                placeholder="500"
                className="w-full text-xs border border-[#d9d0c4] rounded px-2 py-1.5 bg-white"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-serif text-[#333] pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={e => setRemoteOnly(e.target.checked)}
              className="accent-[#d71466]"
            />
            <span>Remote Delivery Only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={verifiedVendorOnly}
              onChange={e => setVerifiedVendorOnly(e.target.checked)}
              className="accent-[#d71466]"
            />
            <span>
              Identity-verified vendors only (not approval/contact verification)
            </span>
          </label>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
              Alerts:
            </span>
            <select
              value={newFrequency}
              onChange={e => setNewFrequency(e.target.value as any)}
              className="text-xs border border-[#d9d0c4] rounded px-2 py-1 bg-white"
            >
              <option value="off">Off (In-App Only)</option>
              <option value="immediate">Immediate Notification</option>
              <option value="daily">Daily Digest</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => {
            if (!newName.trim() || boundsError) return;
            createMutation.mutate({
              name: newName.trim(),
              query: newQuery.trim() || undefined,
              categoryId: newCategoryId,
              listingType: newListingType,
              location: newLocation.trim() || undefined,
              minPrice: minPrice ? Number(minPrice) : undefined,
              maxPrice: maxPrice ? Number(maxPrice) : undefined,
              currency,
              remoteOnly,
              verifiedVendorOnly,
              alertFrequency: newFrequency,
            });
          }}
          disabled={
            !newName.trim() || createMutation.isPending || Boolean(boundsError)
          }
          className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-4 py-2 rounded disabled:opacity-50 cursor-pointer"
        >
          {createMutation.isPending ? "Saving..." : "Save Search"}
        </button>
      </div>

      {/* Saved Searches List */}
      <CollectionPager pagination={data?.pagination} onPage={setPage} label="Saved searches" />
      <div className="space-y-3">
        {(searches?.length || 0) === 0 ? (
          <p className="text-xs font-serif text-[#68635c] text-center py-4">
            No saved searches yet. Add one above to get alerted when matching
            pieces are published.
          </p>
        ) : (
          searches?.map(item => (
            <div
              key={item.id}
              className={`p-4 border rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs ${
                item.isActive
                  ? "border-[#eee8df] bg-[#faf6f0]"
                  : "border-[#d9d0c4] bg-[#f5efe6] opacity-60"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <strong className="font-serif text-sm text-[#0a0a0a]">
                    {item.name}
                  </strong>
                  {!item.isActive && (
                    <span className="text-[10px] uppercase font-bold text-[#8c827a] bg-[#e8e0d5] px-1.5 py-0.5 rounded">
                      Paused
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#68635c] mt-0.5 font-serif">
                  {item.query ? `Keywords: "${item.query}"` : "All keywords"}
                  {item.listingType && ` · ${item.listingType}`}
                  {item.location && ` · 📍 ${item.location}`}
                  {(item.minPrice !== null || item.maxPrice !== null) &&
                    ` · ${item.currency} ${item.minPrice ?? 0}–${item.maxPrice ?? "∞"}`}
                  {item.remoteOnly && " · Remote only"}
                  {item.verifiedVendorOnly &&
                    " · Identity-verified vendors only"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    updateMutation.mutate({
                      id: item.id,
                      isActive: !item.isActive,
                    })
                  }
                  className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] hover:underline"
                >
                  {item.isActive ? "Pause" : "Resume"}
                </button>

                <select
                  value={item.alertFrequency}
                  onChange={e =>
                    updateMutation.mutate({
                      id: item.id,
                      alertFrequency: e.target.value as any,
                    })
                  }
                  className="text-xs border border-[#d9d0c4] rounded px-2 py-1 bg-white"
                >
                  <option value="off">Alerts: Off</option>
                  <option value="immediate">Alerts: Immediate</option>
                  <option value="daily">Alerts: Daily</option>
                </select>

                <Link
                  href={`/marketplace?${new URLSearchParams({
                    ...(item.query ? { q: item.query } : {}),
                    ...(item.categoryId
                      ? {
                          category:
                            categories?.find(
                              category => category.id === item.categoryId
                            )?.slug || "__unknown_category__",
                        }
                      : {}),
                    ...(item.listingType ? { type: item.listingType } : {}),
                    ...(item.location ? { location: item.location } : {}),
                    ...(item.minPrice != null
                      ? { min: String(item.minPrice) }
                      : {}),
                    ...(item.maxPrice != null
                      ? { max: String(item.maxPrice) }
                      : {}),
                    currency: item.currency,
                    ...(item.remoteOnly ? { remote: "true" } : {}),
                    ...(item.verifiedVendorOnly ? { verified: "true" } : {}),
                  })}`}
                  className="text-[11px] font-bold uppercase tracking-wider text-[#d71466] hover:underline"
                >
                  View Listings →
                </Link>

                <button
                  onClick={() => deleteMutation.mutate({ id: item.id })}
                  disabled={deleteMutation.isPending}
                  className="text-[11px] text-[#8c827a] hover:text-red-700 font-bold"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
