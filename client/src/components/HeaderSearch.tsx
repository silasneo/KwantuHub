import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type HeaderSearchProps = {
  onNavigate?: () => void;
};

export function HeaderSearch({ onNavigate }: HeaderSearchProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const inputId = useId();
  const listId = `${inputId}-suggestions`;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const suggest = open && debounced.length > 1;
  const { data: listings } = trpc.marketplace.search.useQuery(
    { q: debounced, pageSize: 4 },
    { enabled: suggest, staleTime: 30_000 }
  );
  const { data: vendors } = trpc.vendors.list.useQuery(
    { query: debounced, pageSize: 3 },
    { enabled: suggest, staleTime: 30_000 }
  );

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
    onNavigate?.();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) go(`/marketplace?q=${encodeURIComponent(value)}`);
  };

  const vendorItems = vendors?.items ?? [];
  const listingItems = listings?.items ?? [];

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      <form
        role="search"
        onSubmit={submit}
        className="flex h-11 items-center rounded-full border border-[#0a0a0a]/15 bg-white pl-4 pr-1 shadow-[inset_0_-2px_0_rgba(10,10,10,0.06)] focus-within:border-[#d71466] focus-within:ring-2 focus-within:ring-[#d71466]/15"
      >
        <label htmlFor={inputId} className="sr-only">
          Search KwantuHub
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          autoComplete="off"
          aria-controls={suggest ? listId : undefined}
          aria-expanded={suggest}
          onFocus={() => setOpen(true)}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={event => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search fabrics, foods, tutors, wedding services…"
          className="min-w-0 flex-1 bg-transparent font-serif text-[17px] italic text-[#0a0a0a] placeholder:text-[#8c827a] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="mr-1 grid h-8 w-8 place-items-center rounded-full text-[#8c827a] hover:text-[#0a0a0a]"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          className="brand-gradient grid h-9 w-9 shrink-0 place-items-center rounded-full text-white"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      </form>

      {suggest && (
        <div
          id={listId}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-lg border border-[#d9d0c4] bg-white p-3 shadow-xl"
        >
          {vendorItems.length > 0 && (
            <div className="mb-3">
              <span className="mb-1 block px-2 text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
                Vendors & storefronts
              </span>
              {vendorItems.map(vendor => {
                const slug =
                  vendor.storefront?.slug ||
                  vendor.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                return (
                  <button
                    key={vendor.id}
                    type="button"
                    onClick={() => go(`/vendors/${slug}`)}
                    className="group flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-[#faf6f0]"
                  >
                    <span className="font-serif font-bold text-[#0a0a0a] group-hover:text-[#d71466]">
                      {vendor.businessName}
                    </span>
                    <span className="text-[11px] text-[#68635c]">
                      {vendor.location || "North America"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {listingItems.length > 0 && (
            <div className="mb-2">
              <span className="mb-1 block px-2 text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
                Listings
              </span>
              {listingItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(`/listings/${item.slug}`)}
                  className="group flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-[#faf6f0]"
                >
                  <span className="truncate font-serif text-[#0a0a0a] group-hover:text-[#d71466]">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold text-[#d71466]">
                    {item.priceIndication || "Inquire"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {vendorItems.length === 0 && listingItems.length === 0 && (
            <p className="py-3 text-center font-serif text-sm text-[#68635c]">
              No quick matches. Press Enter to search the full marketplace.
            </p>
          )}
          <div className="border-t border-[#eee8df] pt-2 text-center">
            <button
              type="button"
              onClick={() => go(`/marketplace?q=${encodeURIComponent(debounced)}`)}
              className="font-serif text-sm font-bold text-[#d71466] hover:underline"
            >
              See all results for “{debounced}” →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
