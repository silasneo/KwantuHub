import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import { Cinzel_Decorative, Cormorant_Garamond, Inter } from "next/font/google";
import { AccountNav } from "@/components/account-nav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});
const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KwantuHub — Where the diaspora finds home",
  description:
    "A discovery-first marketplace for African diaspora goods and services across North America.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${cormorant.variable} ${cinzel.variable}`}
      >
        <header className="site-header">
          <div className="utility shell">
            <span>Ship to: United States</span>
            <span>English</span>
          </div>
          <div className="header-main shell">
            <Link className="brand" href="/">
              <Image
                className="brand-logo"
                src="/brand/kwantu-logo-black.png"
                alt=""
                width={36}
                height={36}
                priority
              />
              <span>KwantuHub</span>
            </Link>
            <nav>
              <Link href="/marketplace">Marketplace</Link>
              <Link href="/marketplace?type=SERVICE">Services</Link>
              <Link href="/register?role=VENDOR">List your business</Link>
              <AccountNav />
            </nav>
          </div>
        </header>
        {children}
        <footer className="footer">
          <div className="shell footer-grid">
            <div>
              <div className="brand">
                <Image
                  className="brand-logo"
                  src="/brand/kwantu-logo-white.png"
                  alt=""
                  width={36}
                  height={36}
                />
                <span>KwantuHub</span>
              </div>
              <p>Where the diaspora finds home.</p>
            </div>
            <div>
              <b>Marketplace</b>
              <Link href="/marketplace">Browse listings</Link>
              <Link href="/marketplace?type=SERVICE">Services</Link>
            </div>
            <div>
              <b>Vendors</b>
              <Link href="/register?role=VENDOR">List your business</Link>
              <Link href="/login">Vendor login</Link>
            </div>
            <div>
              <b>About</b>
              <Link href="/about">Our story</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
