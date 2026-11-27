import { useState } from "react";
import { Link } from "wouter";
import { Menu } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { HeaderSearch } from "./HeaderSearch";
import { MegaMenuNav, useMarketplaceMenu } from "./MegaMenuNav";
import { NotificationCenter } from "./NotificationCenter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

const MARKET_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/vendors", label: "Vendors" },
  { href: "/marketplace?category=african-food-groceries", label: "Foods & Groceries" },
  { href: "/marketplace?category=education-learning", label: "Languages & Tutors" },
  { href: "/marketplace?category=events-celebrations", label: "Weddings & Events" },
  { href: "/marketplace?category=professional-business-services", label: "Business Services" },
] as const;

function BrandMark() {
  return (
    <Link href="/" className="group flex w-max shrink-0 items-center gap-2.5">
      <img
        src="/media/public/Kwantu-identity_fc192da7.svg"
        alt="KwantuHub Mark"
        className="h-10 w-auto object-contain transition-transform group-hover:scale-105 md:h-11"
      />
      <span className="font-brand text-xl font-bold tracking-wider text-[#0a0a0a] md:text-2xl">
        KwantuHub
      </span>
    </Link>
  );
}

function AccountActions({ stacked = false, onNavigate }: { stacked?: boolean; onNavigate?: () => void }) {
  const { user, isAuthenticated, logout } = useAuth();
  const wrap = stacked
    ? "flex flex-col items-start gap-4"
    : "flex items-center gap-3 lg:gap-4";

  if (!isAuthenticated || !user) {
    return (
      <div className={wrap}>
        <Link
          href="/vendor/onboarding"
          onClick={onNavigate}
          className="brand-gradient rounded px-4 py-2.5 font-serif text-xs font-bold uppercase tracking-widest text-white transition hover:opacity-95"
        >
          List Your Business
        </Link>
        <Link
          href="/login"
          onClick={onNavigate}
          className="rounded border border-[#0a0a0a] px-3.5 py-2 font-serif text-xs font-bold uppercase tracking-widest transition hover:bg-[#0a0a0a] hover:text-white"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className={wrap}>
      {!stacked && user.emailVerifiedAt && <NotificationCenter />}
      {user.role === "admin" && (
        <Link
          href="/admin"
          onClick={onNavigate}
          className="rounded bg-[#fef2f2] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#d71466]"
        >
          Admin
        </Link>
      )}
      {user.role === "vendor" && (
        <Link
          href="/vendor"
          onClick={onNavigate}
          className="rounded bg-[#fff7ed] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#fe8129]"
        >
          Vendor Portal
        </Link>
      )}
      <Link
        href={user.emailVerifiedAt ? "/account" : "/verify-account"}
        onClick={onNavigate}
        className="font-serif text-xs uppercase tracking-wider transition hover:text-[#d71466]"
      >
        {user.emailVerifiedAt ? "Saved & Inquiries" : "Verify email"}
      </Link>
      <Link
        href="/profile"
        onClick={onNavigate}
        className="group flex items-center gap-2 transition hover:opacity-80"
        title="View your profile"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name || "User"}
            className="h-8 w-8 rounded-full border border-[#d9d0c4] object-cover"
          />
        ) : (
          <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full font-serif text-xs font-bold text-white">
            {user.name ? user.name[0].toUpperCase() : "U"}
          </div>
        )}
        <span className={`font-serif text-xs font-bold text-[#0a0a0a] group-hover:text-[#d71466] ${stacked ? "" : "hidden xl:inline"}`}>
          {user.name?.split(" ")[0] || "Profile"}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          logout();
        }}
        className="cursor-pointer font-serif text-xs uppercase tracking-wider text-[#68635c] transition hover:text-[#0a0a0a]"
      >
        Sign out
      </button>
    </div>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { enabled, groups } = useMarketplaceMenu();
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="grid h-10 w-10 place-items-center text-[#0a0a0a]"
      >
        <Menu className="h-6 w-6" />
      </button>
      <SheetContent side="right" className="w-[min(100vw,420px)] overflow-y-auto bg-[#f0e8dc] p-6">
        <SheetTitle className="font-brand text-xl">KwantuHub</SheetTitle>
        <SheetDescription className="sr-only">Search and browse KwantuHub</SheetDescription>
        <div className="mt-4">
          <HeaderSearch onNavigate={close} />
        </div>
        <nav className="mt-6 flex flex-col gap-3 border-t border-[#0a0a0a]/10 pt-5" aria-label="Marketplace">
          {MARKET_LINKS.map(link => (
            <Link key={link.href} href={link.href} onClick={close} className="text-xs font-extrabold uppercase tracking-[0.06em]">
              {link.label}
            </Link>
          ))}
          <Link href="/about" onClick={close} className="text-xs font-extrabold uppercase tracking-[0.06em]">
            About KwantuHub
          </Link>
        </nav>
        {enabled && groups.length > 0 && (
          <div className="mt-6 border-t border-[#0a0a0a]/10 pt-5">
            <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#d71466]">
              Categories
            </p>
            {groups.map((group, index) => (
              <section key={group.key} className="border-t border-[#0a0a0a]/10 py-3">
                <h3 className="mb-1.5 flex items-center gap-2 font-serif text-base font-bold">
                  <span className="font-sans text-[10px] font-extrabold text-[#d71466]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {group.title}
                </h3>
                <div className="grid grid-cols-2 gap-x-3">
                  {group.items.map(category => (
                    <Link
                      key={category.id}
                      href={`/marketplace?category=${category.slug}`}
                      onClick={close}
                      className="py-1 font-serif text-[15px] leading-tight text-[#4b4843]"
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <div className="mt-6 border-t border-[#0a0a0a]/10 pt-5">
          <AccountActions stacked onNavigate={close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SiteHeader() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-[#0a0a0a]/10 bg-[#f0e8dc]">
      <div className="bg-[#0a0a0a] text-[11px] tracking-[0.06em] text-[#f0e8dc]">
        <div className="mx-auto flex h-[35px] max-w-7xl items-center justify-between px-5 md:px-8">
          <span className="font-serif">African Diaspora Marketplace • North America</span>
          <span className="hidden gap-5 sm:flex">
            <span>Ship to: 🇺🇸 United States</span>
            <span>English</span>
          </span>
        </div>
      </div>

      <div className="mx-auto grid h-[74px] max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-5 md:h-[88px] md:grid-cols-[auto_minmax(220px,1fr)_auto] md:gap-6 md:px-8">
        <BrandMark />
        <div className="hidden min-w-0 md:block">
          <HeaderSearch />
        </div>
        <div className="hidden justify-self-end md:block">
          <AccountActions />
        </div>
        <div className="flex items-center gap-1 md:hidden">
          {user?.emailVerifiedAt && <NotificationCenter />}
          <MobileMenu />
        </div>
      </div>

      <nav className="hidden border-t border-[#0a0a0a]/10 bg-white/20 md:block" aria-label="Marketplace">
        <div className="mx-auto flex min-h-[45px] max-w-7xl items-center overflow-x-auto px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="mr-5 hidden shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#4b4843] xl:inline">
            Market index
          </span>
          <MegaMenuNav />
          {MARKET_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-[45px] shrink-0 items-center border-l border-[#0a0a0a]/10 px-3.5 text-[11px] font-extrabold uppercase tracking-[0.055em] text-[#0a0a0a] hover:text-[#d71466]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/about"
            className="flex min-h-[45px] shrink-0 items-center border-x border-[#0a0a0a]/10 px-3.5 text-[11px] font-extrabold uppercase tracking-[0.055em] text-[#0a0a0a] hover:text-[#d71466]"
          >
            About KwantuHub ↗
          </Link>
        </div>
      </nav>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="bg-[#0a0a0a] text-[#f0e8dc] mt-24 pt-16 pb-12 border-t border-[#222]">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="md:col-span-1">
          {/* Logo Mark + White Cinzel Wordmark */}
          <Link href="/" className="flex items-center gap-3 mb-4 group">
            <img
              src="/media/public/Kwantu-identity_fc192da7.svg"
              alt="KwantuHub Mark"
              className="h-9 w-auto object-contain brightness-0 invert"
            />
            <span className="font-brand text-2xl font-bold tracking-wider text-white">
              KwantuHub
            </span>
          </Link>
          <p className="text-sm font-serif text-[#a8a199] leading-relaxed">
            Where the diaspora finds home. Connecting African-owned businesses
            and artisans with community across North America.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-serif font-bold uppercase tracking-widest text-[#d71466] mb-4">
            Marketplace
          </h4>
          <ul className="space-y-2 text-sm font-serif text-[#d1c8bd]">
            <li>
              <Link
                href="/marketplace?category=african-food-groceries"
                className="hover:text-white"
              >
                African Food & Groceries
              </Link>
            </li>
            <li>
              <Link
                href="/marketplace?category=fashion-textiles"
                className="hover:text-white"
              >
                Fashion & Textiles
              </Link>
            </li>
            <li>
              <Link
                href="/marketplace?category=beauty-personal-care"
                className="hover:text-white"
              >
                Beauty & Personal Care
              </Link>
            </li>
            <li>
              <Link
                href="/marketplace?category=education-learning"
                className="hover:text-white"
              >
                Education & Languages
              </Link>
            </li>
            <li>
              <Link href="/marketplace" className="hover:text-white">
                All Categories →
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-serif font-bold uppercase tracking-widest text-[#fe8129] mb-4">
            Vendors
          </h4>
          <ul className="space-y-2 text-sm font-serif text-[#d1c8bd]">
            <li>
              <Link href="/vendors" className="hover:text-white">
                Browse Vendors
              </Link>
            </li>
            <li>
              <Link href="/vendor/onboarding" className="hover:text-white">
                Join as a Vendor
              </Link>
            </li>
            <li>
              <Link href="/vendor" className="hover:text-white">
                Vendor Portal
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-white">
                Vendor Standards
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-serif font-bold uppercase tracking-widest text-[#d1c8bd] mb-4">
            Platform
          </h4>
          <ul className="space-y-2 text-sm font-serif text-[#d1c8bd]">
            <li>
              <Link href="/about" className="hover:text-white">
                Our Mission & Story
              </Link>
            </li>
            <li>
              <Link href="/account" className="hover:text-white">
                Buyer Inquiries
              </Link>
            </li>
            <li>
              <a href="/api-docs" className="hover:text-white">
                API Swagger Documentation →
              </a>
            </li>
            <li>
              <span className="text-xs text-[#777]">
                Version: MVP v1.1 Production
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 mt-12 pt-8 border-t border-[#222] text-xs font-serif text-[#777] flex flex-col sm:flex-row justify-between items-center gap-4">
        <span>
          © {new Date().getFullYear()} KwantuHub. All rights reserved.
        </span>
        <span>Empowering African Cultural Commerce</span>
      </div>
    </footer>
  );
}
