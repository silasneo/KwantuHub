/**
 * Diaspora Market Almanac: shared ink-on-paper navigation, an editorial category index, and a considered mega menu.
 */
import { ChevronDown, Menu, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

const logoUrl = "/manus-storage/Kwantu-identity_352aec3a.svg";

const megaGroups = [
  {
    title: "Textiles & style",
    items: [
      "Nigerian & West African Fabrics",
      "East & Southern African Textiles",
      "Traditional & Cultural Attire",
      "Bespoke Diaspora Tailoring & Fashion Design",
      "Handcrafted Jewelry & Accessories",
    ],
  },
  {
    title: "Food & celebration",
    items: [
      "African Foods & Groceries",
      "Regional Bakery & Fresh Foods",
      "Specialty Catering & Event Chefs",
      "Traditional Wedding Services & Event Planning",
      "Cultural Music & Instruments",
    ],
  },
  {
    title: "Learning & culture",
    items: [
      "Children’s African Language Tutors",
      "Adult Language & Cultural Immersion",
      "Diaspora Bookstores & Literature",
      "African Art & Sculptures",
      "Faith & Spiritual Goods",
    ],
  },
  {
    title: "Care & home",
    items: [
      "Handwoven Home Décor & Baskets",
      "Beauty & Natural Hair Care",
      "African Hair Braiding & Natural Hair Styling",
      "Health & Wellness",
      "Remote Diaspora Professional Services",
    ],
  },
  {
    title: "Life across borders",
    items: [
      "Diaspora Real Estate & Relocation Advisory",
      "Cultural Tourism & Heritage Travel Services",
      "Relocation Services",
      "Housing Services",
      "Tax/Financial Services",
    ],
  },
];

type ChromeProps = { onNotice: (label: string) => void };

export function SiteHeader({ onNotice }: ChromeProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const closeAll = () => { setMobileOpen(false); setMegaOpen(false); };
  const notice = (label: string) => { closeAll(); onNotice(`${label} is coming soon.`); };
  const browseCategory = (category: string) => { closeAll(); onNotice(`${category} browsing is coming soon.`); };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setMegaOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeAll(); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("mousedown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  return (
    <>
      <div className="utility-bar">
        <div className="page-shell utility-inner">
          <button type="button" onClick={() => notice("Shipping destination")}>Ship to: <span aria-hidden="true">🇺🇸</span> United States <ChevronDown size={13} /></button>
          <button type="button" onClick={() => notice("Language selection")}><span aria-hidden="true">◌</span> English <ChevronDown size={13} /></button>
        </div>
      </div>

      <header className={`site-header ${megaOpen ? "has-mega-open" : ""}`} ref={headerRef}>
        <div className="page-shell header-main">
          <Link href="/" className="brand-lockup" aria-label="KwantuHub home" onClick={closeAll}>
            <img src={logoUrl} alt="Kwantu heritage knot" /><span>KwantuHub</span>
          </Link>

          <form className="site-search" onSubmit={(event) => { event.preventDefault(); onNotice("Search is ready for the marketplace launch."); }}>
            <label className="sr-only" htmlFor="marketplace-search">Search KwantuHub</label>
            <input id="marketplace-search" placeholder="Search fabrics, foods, tutors, wedding services…" />
            <button type="submit" aria-label="Search marketplace"><Search size={18} /></button>
          </form>

          <div className="account-actions" aria-label="Account actions">
            {["Inquiries", "Favorites", "Vendor Portal"].map((item) => <button key={item} type="button" onClick={() => notice(item)}>{item}</button>)}
          </div>

          <button className="mobile-menu-button" type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => { setMobileOpen(!mobileOpen); if (mobileOpen) setMegaOpen(false); }}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <nav className={`category-nav ${mobileOpen ? "is-open" : ""}`} aria-label="Marketplace sections">
          <div className="page-shell category-nav-inner">
            <button id="mega-categories-trigger" type="button" className={`categories-trigger ${megaOpen ? "is-active" : ""}`} aria-expanded={megaOpen} aria-controls="categories-mega-menu" onClick={() => setMegaOpen(!megaOpen)}>
              Categories <ChevronDown size={14} />
            </button>
            <a href="#vendors" onClick={closeAll}>Featured Vendors</a>
            <a href="#languages" onClick={closeAll}>Languages &amp; Tutors</a>
            <a href="#weddings" onClick={closeAll}>Weddings</a>
            <a href="#categories" onClick={closeAll}>Foods &amp; Groceries</a>
            <a href="#categories" onClick={closeAll}>Trending</a>
            <button type="button" onClick={() => notice("Business Services")}>Business Services</button>
            <Link href="/about" onClick={closeAll} className="about-nav-link">About KwantuHub</Link>
          </div>
        </nav>

        {megaOpen && (
          <div id="categories-mega-menu" className="mega-menu" role="region" aria-label="Browse marketplace categories">
            <div className="page-shell mega-menu-inner">
              <aside className="mega-intro">
                <p className="mega-kicker">The market index</p>
                <h2>Find what<br /><em>holds you close.</em></h2>
                <p>Twenty-five cultural aisles, each designed to lead you back to the people behind the work.</p>
                <a href="#categories" onClick={closeAll}>Explore all categories <span>↗</span></a>
              </aside>
              <div className="mega-groups">
                {megaGroups.map((group, groupIndex) => (
                  <section className="mega-group" key={group.title} aria-labelledby={`mega-group-${groupIndex}`}>
                    <h3 id={`mega-group-${groupIndex}`}><span>{String(groupIndex + 1).padStart(2, "0")}</span>{group.title}</h3>
                    <div>{group.items.map((item) => <button type="button" key={item} onClick={() => browseCategory(item)}>{item}</button>)}</div>
                  </section>
                ))}
              </div>
            </div>
            <div className="page-shell mega-menu-foot"><span>KwantuHub market guide</span><span>Discover, inquire, keep close.</span></div>
          </div>
        )}
      </header>
    </>
  );
}

export function SiteFooter({ onNotice }: ChromeProps) {
  const columns = [
    { title: "Marketplace", links: ["Browse categories", "Featured vendors", "Languages & tutors", "Weddings"] },
    { title: "Vendors", links: ["List your business", "Vendor standards", "Pricing & access", "Vendor stories"] },
    { title: "About", links: ["Our story", "What we believe", "Leadership", "Impact"] },
    { title: "Support", links: ["Help center", "Trust & safety", "Contact KwantuHub", "Accessibility"] },
  ];

  return (
    <footer className="site-footer">
      <div className="page-shell footer-grid">
        <div className="footer-intro">
          <Link href="/" className="brand-lockup footer-brand" aria-label="KwantuHub home"><img src={logoUrl} alt="Kwantu heritage knot" /><span>KwantuHub</span></Link>
          <p>Where the diaspora finds home.</p><div className="footer-rule" /><p className="footer-note">A discovery-first marketplace for the people, goods, and services that keep community close.</p>
        </div>
        {columns.map((column) => (
          <div className="footer-column" key={column.title}>
            <h3>{column.title}</h3>
            {column.links.map((link) => link === "Our story" ? <Link key={link} href="/about">{link}</Link> : <button key={link} type="button" onClick={() => onNotice(`${link} is coming soon.`)}>{link}</button>)}
          </div>
        ))}
      </div>
      <div className="page-shell footer-bottom"><span>© 2026 Kwantu Hub LLC</span><span>Made for diaspora discovery across North America.</span></div>
    </footer>
  );
}
