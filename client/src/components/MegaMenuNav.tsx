import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export function MegaMenuNav() {
  const [open, setOpen] = useState(false);
  const { data } = trpc.marketplace.megaMenu.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (!data?.enabled) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="kwantuhub-mega-menu"
        onClick={() => setOpen(value => !value)}
        className="hover:text-[#d71466] transition uppercase tracking-widest"
      >
        Explore
      </button>
      {open && (
        <div
          id="kwantuhub-mega-menu"
          className="absolute right-0 top-full mt-5 w-[min(90vw,42rem)] bg-white border border-[#d9d0c4] shadow-xl p-6 grid grid-cols-2 sm:grid-cols-3 gap-4 z-50"
        >
          {data.categories.map(category => (
            <Link
              key={category.id}
              href={`/marketplace?category=${category.slug}`}
              onClick={() => setOpen(false)}
              className="font-serif text-sm text-[#0a0a0a] hover:text-[#d71466]"
            >
              <span className="block font-bold">{category.name}</span>
              <span className="block text-[10px] uppercase tracking-wider text-[#68635c] mt-1">
                Browse offerings →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
