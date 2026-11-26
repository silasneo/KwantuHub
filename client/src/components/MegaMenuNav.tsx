import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import { groupCategories } from "@shared/categoryGroups";
import { trpc } from "@/lib/trpc";

export function useMarketplaceMenu() {
  const { data } = trpc.marketplace.megaMenu.useQuery(undefined, {
    staleTime: 60_000,
  });
  return {
    enabled: Boolean(data?.enabled),
    groups: groupCategories(data?.categories ?? []),
  };
}

/**
 * Categories trigger plus a full-width panel. The panel is absolutely
 * positioned against the nearest positioned ancestor (the site header).
 */
export function MegaMenuNav() {
  const { enabled, groups } = useMarketplaceMenu();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!enabled || groups.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="kwantuhub-mega-menu"
        onClick={() => setOpen(value => !value)}
        className="relative flex min-h-[45px] shrink-0 items-center gap-1.5 border-l border-[#0a0a0a]/10 px-3 text-[11px] font-extrabold uppercase tracking-[0.055em] text-[#0a0a0a] hover:text-[#d71466] xl:px-3.5"
      >
        Categories
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
        {open && <span className="brand-gradient absolute inset-x-3.5 bottom-0 h-[3px]" aria-hidden />}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="kwantuhub-mega-menu"
          role="region"
          aria-label="Browse marketplace categories"
          className="absolute inset-x-0 top-full z-40 border-t border-[#0a0a0a]/15 bg-white shadow-[0_26px_42px_rgba(10,10,10,0.16)] animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="mx-auto grid max-w-7xl grid-cols-[240px_1fr] gap-8 px-8 py-8 xl:grid-cols-[280px_1fr] xl:gap-10">
            <aside className="flex min-h-[380px] flex-col bg-[#0a0a0a] px-6 py-7 text-[#f0e8dc]">
              <p className="mb-6 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#fe8129]">
                The market index
              </p>
              <h2 className="mb-5 font-serif text-[40px] font-bold leading-[0.9] tracking-[-0.05em]">
                Find what
                <br />
                <em className="font-medium">holds you close.</em>
              </h2>
              <p className="font-serif text-[17px] leading-tight text-[#f0e8dc]/75">
                Cultural aisles, each designed to lead you back to the people behind the work.
              </p>
              <Link
                href="/marketplace"
                onClick={() => setOpen(false)}
                className="mt-auto w-max border-b border-[#f0e8dc] pb-1 pt-8 text-[10px] font-extrabold uppercase tracking-[0.075em]"
              >
                Explore the marketplace ↗
              </Link>
            </aside>
            <div className="grid grid-cols-3 content-start gap-x-5 gap-y-7 xl:grid-cols-5">
              {groups.map((group, index) => (
                <section key={group.key}>
                  <h3 className="mb-3 flex min-h-[52px] items-end gap-2 border-b border-[#0a0a0a]/15 pb-2 font-serif text-base font-bold leading-tight">
                    <span className="pb-0.5 font-sans text-[10px] font-extrabold text-[#d71466]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {group.title}
                  </h3>
                  <ul>
                    {group.items.map(category => (
                      <li key={category.id}>
                        <Link
                          href={`/marketplace?category=${category.slug}`}
                          onClick={() => setOpen(false)}
                          className="group flex items-center py-1.5 font-serif text-[15px] leading-tight text-[#4b4843] transition-all hover:pl-1 hover:text-[#0a0a0a]"
                        >
                          <span className="brand-gradient mr-0 inline-block h-[2px] w-0 shrink-0 transition-all group-hover:mr-1.5 group-hover:w-2.5" aria-hidden />
                          {category.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
          <div className="mx-auto max-w-7xl px-8 pb-3">
            <div className="flex justify-between border-b-2 border-[#d71466] pb-3 text-[10px] font-extrabold uppercase tracking-[0.11em] text-[#4b4843]">
              <span>KwantuHub market guide</span>
              <span>Discover, inquire, keep close.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
