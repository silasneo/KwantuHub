import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ExpandingHeaderSearch } from "./ExpandingHeaderSearch";
import { MegaMenuNav } from "./MegaMenuNav";

export function SiteHeader() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#d9d0c4]">
      {/* Utility Bar */}
      <div className="border-b border-[#eee8df] bg-[#faf6f0] text-[#68635c] text-xs py-1.5 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <span className="font-serif tracking-wide">
            African Diaspora Marketplace • North America
          </span>
          <div className="flex gap-4 items-center">
            <span>Ship to: 🇺🇸 United States</span>
            <span>English</span>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between gap-4">
        {/* Brand: Logo mark + Approved Cinzel Decorative Wordmark in Kohl Black */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <img
            src="/manus-storage/Kwantu-identity_fc192da7.svg"
            alt="KwantuHub Mark"
            className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
          />
          <span className="font-brand text-2xl font-bold tracking-wider text-[#0a0a0a]">
            KwantuHub
          </span>
        </Link>

        {/* Center / Right Nav: Editorial Cormorant uppercase links + Expanding search + CTA */}
        <div className="flex items-center gap-4 sm:gap-6">
          <nav className="hidden md:flex items-center gap-6 font-serif text-sm uppercase tracking-widest font-semibold text-[#0a0a0a]">
            <Link
              href="/marketplace"
              className="hover:text-[#d71466] transition"
            >
              Marketplace
            </Link>
            <MegaMenuNav />
            <Link href="/vendors" className="hover:text-[#d71466] transition">
              Vendors
            </Link>
          </nav>

          {/* Color-branded expandable search bar */}
          <ExpandingHeaderSearch />

          {isAuthenticated && user ? (
            <div className="flex items-center gap-3 sm:gap-4 pl-3 border-l border-[#d9d0c4]">
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="text-[11px] uppercase tracking-wider font-bold text-[#d71466] bg-[#fef2f2] px-2.5 py-1 rounded"
                >
                  Admin
                </Link>
              )}
              {user.role === "vendor" && (
                <Link
                  href="/vendor"
                  className="text-[11px] uppercase tracking-wider font-bold text-[#fe8129] bg-[#fff7ed] px-2.5 py-1 rounded"
                >
                  Vendor Portal
                </Link>
              )}
              <Link
                href="/account"
                className="hover:text-[#d71466] transition text-xs font-serif uppercase tracking-wider"
              >
                Saved & Inquiries
              </Link>

              {/* User Avatar + Profile Link at far right before Sign out */}
              <Link
                href="/profile"
                className="flex items-center gap-2 pl-2 hover:opacity-80 transition group"
                title="View your profile"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name || "User"}
                    className="w-8 h-8 rounded-full border border-[#d9d0c4] object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full brand-gradient text-white flex items-center justify-center text-xs font-bold font-serif">
                    {user.name ? user.name[0].toUpperCase() : "U"}
                  </div>
                )}
                <span className="text-xs font-serif font-bold text-[#0a0a0a] group-hover:text-[#d71466] hidden lg:inline">
                  {user.name?.split(" ")[0] || "Profile"}
                </span>
              </Link>

              <button
                onClick={() => logout()}
                className="text-xs font-serif text-[#68635c] hover:text-[#0a0a0a] transition cursor-pointer pl-1 uppercase tracking-wider"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 pl-3 border-l border-[#d9d0c4]">
              <Link
                href="/vendor/onboarding"
                className="text-xs font-serif font-bold uppercase tracking-widest text-white brand-gradient px-4 py-2.5 rounded hover:opacity-95 transition"
              >
                List Your Business
              </Link>
              <Link
                href="/login"
                className="text-xs font-serif font-bold uppercase tracking-widest border border-[#0a0a0a] px-3.5 py-2 rounded hover:bg-[#0a0a0a] hover:text-white transition"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
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
              src="/manus-storage/Kwantu-identity_fc192da7.svg"
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
