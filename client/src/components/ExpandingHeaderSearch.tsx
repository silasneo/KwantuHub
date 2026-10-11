import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export function ExpandingHeaderSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  // Search preview for quick jump
  const { data: searchResults } = trpc.marketplace.search.useQuery(
    { q: query, pageSize: 4 },
    { enabled: isOpen && query.trim().length > 1 }
  );

  const { data: vendors } = trpc.vendors.list.useQuery(undefined, {
    enabled: isOpen && query.trim().length > 1,
  });

  const matchingVendors = (vendors || [])
    .filter(
      v =>
        v.businessName.toLowerCase().includes(query.toLowerCase()) ||
        (v.description &&
          v.description.toLowerCase().includes(query.toLowerCase()))
    )
    .slice(0, 2);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Click outside to collapse
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim()) {
        setLocation(`/marketplace?q=${encodeURIComponent(query.trim())}`);
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setLocation(`/marketplace?q=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      <form
        onSubmit={handleSearchSubmit}
        className={`flex items-center transition-all duration-300 ease-out border rounded-full overflow-hidden ${
          isOpen
            ? "w-64 sm:w-80 md:w-96 bg-[#faf6f0] border-[#d71466] shadow-md ring-2 ring-[#d71466]/20"
            : "w-10 h-10 border-transparent bg-transparent justify-center"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (!isOpen) {
              setIsOpen(true);
            } else if (query.trim()) {
              setLocation(`/marketplace?q=${encodeURIComponent(query.trim())}`);
              setIsOpen(false);
            } else {
              setIsOpen(false);
            }
          }}
          className={`flex items-center justify-center shrink-0 w-10 h-10 rounded-full transition-colors cursor-pointer ${
            isOpen
              ? "text-[#d71466] hover:bg-[#eee8df]"
              : "text-[#0a0a0a] hover:bg-[#faf6f0] hover:text-[#d71466]"
          }`}
          aria-label={isOpen ? "Execute search" : "Open search bar"}
          title={isOpen ? "Search" : "Search products, services, vendors"}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search products, services, vendors..."
          className={`bg-transparent text-xs text-[#0a0a0a] placeholder-[#8c827a] font-serif focus:outline-none transition-all duration-200 ${
            isOpen
              ? "w-full px-2 py-2 opacity-100"
              : "w-0 p-0 opacity-0 pointer-events-none"
          }`}
        />

        {isOpen && query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="p-2 text-[#8c827a] hover:text-[#0a0a0a] text-xs shrink-0 cursor-pointer"
            aria-label="Clear search input"
          >
            ✕
          </button>
        )}
      </form>

      {/* Auto-suggest dropdown when open and typing */}
      {isOpen && query.trim().length > 1 && (
        <div className="absolute top-12 right-0 w-80 sm:w-96 bg-white border border-[#d9d0c4] rounded-lg shadow-xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="text-[10px] uppercase font-bold tracking-wider text-[#d71466] mb-2 px-2">
            Instant Suggestions
          </div>

          {/* Matching Vendors */}
          {matchingVendors.length > 0 && (
            <div className="mb-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#68635c] block px-2 mb-1">
                Vendors & Storefronts
              </span>
              {matchingVendors.map(v => {
                const slug =
                  v.storefront?.slug ||
                  v.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setLocation(`/vendors/${slug}`);
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-[#faf6f0] flex items-center justify-between text-xs cursor-pointer group"
                  >
                    <span className="font-serif font-bold text-[#0a0a0a] group-hover:text-[#d71466]">
                      {v.businessName}
                    </span>
                    <span className="text-[10px] text-[#68635c]">
                      {v.location || "North America"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Matching Listings */}
          {searchResults?.items && searchResults.items.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#68635c] block px-2 mb-1">
                Creations & Offerings
              </span>
              {searchResults.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setLocation(`/listings/${item.slug}`);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-[#faf6f0] flex items-center justify-between text-xs cursor-pointer group"
                >
                  <span className="font-serif text-[#0a0a0a] group-hover:text-[#d71466] truncate max-w-[200px]">
                    {item.title}
                  </span>
                  <span className="text-[10px] font-bold text-[#d71466]">
                    {item.priceIndication || "Inquire"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {matchingVendors.length === 0 &&
            (!searchResults?.items || searchResults.items.length === 0) && (
              <div className="py-4 text-center font-serif text-xs text-[#68635c]">
                No quick matches found. Press Enter to search full catalog.
              </div>
            )}

          <div className="pt-2 border-t border-[#eee8df] text-center">
            <button
              type="button"
              onClick={() => {
                setLocation(
                  `/marketplace?q=${encodeURIComponent(query.trim())}`
                );
                setIsOpen(false);
              }}
              className="text-xs font-serif font-bold text-[#d71466] hover:underline"
            >
              See all results for "{query}" →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
