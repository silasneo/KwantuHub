/**
 * Diaspora Market Almanac: asymmetric editorial marketplace homepage with warm paper, ink, and Nok-gradient signals.
 */
import { ArrowRight, Check, ChevronLeft, ChevronRight, Heart, MapPin, MessageCircle, MoveUpRight, Pause, Play, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { heroSlides } from "@/data/heroSlides";

const assets = {
  fashion: "/manus-storage/kwantu-hero-fashion-maker_20399257.jpg",
  catering: "/manus-storage/kwantu-hero-caterer_500a9501.jpg",
  tutor: "/manus-storage/kwantu-tutor-family_96516297.jpg",
  braider: "/manus-storage/kwantu-braider_2d92759f.jpg",
  artisan: "/manus-storage/kwantu-ceramic-artisan_b25dc934.jpg",
  tailor: "/manus-storage/kwantu-ceremony-tailor_6da99e5d.jpg",
  jewelry: "/manus-storage/kwantu-jewelry-maker_625113de.jpg",
  books: "/manus-storage/kwantu-bookshop-owner_6310a59b.jpg",
  music: "/manus-storage/kwantu-drum-maker_4bcb2f79.jpg",
  wellness: "/manus-storage/kwantu-wellness-tea_06aa39c7.jpg",
};

const categories = [
  { name: "Fabrics & Textiles", detail: "Ankara · Adire · Aso-Oke · Kente", image: assets.fashion, count: "Made to carry stories" },
  { name: "Weddings & Events", detail: "Planning · Fashion · Catering · Music", image: assets.tailor, count: "Gather beautifully" },
  { name: "Art & Adornment", detail: "Jewelry · Baskets · Sculpture · Décor", image: assets.jewelry, count: "Objects with origin" },
  { name: "Books & Literature", detail: "Bookshops · Poetry · Diaspora archives", image: assets.books, count: "Keep the record" },
  { name: "Cultural Music", detail: "Instruments · Lessons · Live music", image: assets.music, count: "Find the rhythm" },
  { name: "Health & Wellness", detail: "Herbal remedies · Teas · Care", image: assets.wellness, count: "Make room to restore" },
];

const vendors = [
  { name: "Aunty Eki’s Ankara", category: "Textiles & clothing", place: "Houston, TX", image: assets.tailor },
  { name: "Mama Africa Braids", category: "Beauty & natural hair", place: "Toronto, ON", image: assets.braider },
  { name: "Studio Yorùbá", category: "Language learning", place: "Chicago, IL", image: assets.tutor },
  { name: "Spice Route Kenya", category: "Foods & catering", place: "Minneapolis, MN", image: assets.catering },
];

const languages = ["Amharic", "Yorùbá", "Igbo", "Twi", "Kiswahili", "Wolof", "Hausa", "Zulu", "Ewe", "Lingala", "Shona", "Somali", "Akan", "Oromo", "Bambara", "Kikongo", "Fula", "Krio", "Xhosa", "Tigrinya", "Bété", "Sango", "Sesotho", "Arabic"];

export default function Home() {
  const [notice, setNotice] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };
  const selectSlide = (index: number) => setActiveSlide((index + heroSlides.length) % heroSlides.length);
  const activeHero = heroSlides[activeSlide];

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isPaused || reduceMotion) return;
    const timer = window.setInterval(() => selectSlide(activeSlide + 1), 8000);
    return () => window.clearInterval(timer);
  }, [activeSlide, isPaused]);

  return (
    <div className="app-frame">
      <SiteHeader onNotice={notify} />
      <main>
        <section className={`hero-section hero-slider hero-slider--${activeHero.tone}`} aria-roledescription="carousel" aria-label="KwantuHub marketplace stories">
          <div className="hero-background" key={activeHero.id} role="img" aria-label={activeHero.imageAlt} style={{ backgroundImage: `url(${activeHero.image})`, backgroundPosition: activeHero.position }} />
          <div className="hero-image-scrim" aria-hidden="true" />
          <div className="page-shell hero-slider-layout">
            <div className="hero-copy">
              <p className="hero-eyebrow"><span className="gradient-dot" /> {activeHero.eyebrow}</p>
              <h1>{activeHero.headline} <em>{activeHero.emphasis}</em></h1>
              <p className="hero-dek">{activeHero.description}</p>
              <div className="hero-actions">
                <a className="button button-primary" href={activeHero.primaryHref} onClick={(event) => { if (activeSlide === 2) { event.preventDefault(); notify("The Christmas sale category is being prepared for launch."); } }}>{activeHero.primaryLabel} <ArrowRight size={18} /></a>
                <button className="button button-outline" type="button" onClick={() => notify(activeSlide === 0 ? "Vendor applications are opening soon." : activeSlide === 1 ? "The maker archive is opening soon." : "Gift guides are coming soon.")}>{activeHero.secondaryLabel}</button>
              </div>
              <div className="hero-caption"><span>{activeHero.id}</span><p>{activeHero.note}</p></div>
            </div>
            <div className="hero-slider-footer" aria-label="Hero carousel controls">
              <p><span>{activeHero.id}</span> <b>{activeHero.label}</b></p>
              <div className="hero-slider-buttons">
                <button type="button" className="hero-control" onClick={() => selectSlide(activeSlide - 1)} aria-label="Previous hero slide"><ChevronLeft size={19} /></button>
                <div className="hero-dots" role="tablist" aria-label="Choose a hero slide">
                  {heroSlides.map((slide, index) => <button type="button" role="tab" aria-selected={index === activeSlide} aria-label={`Show slide ${index + 1}: ${slide.label}`} className={index === activeSlide ? "is-active" : ""} key={slide.id} onClick={() => selectSlide(index)} />)}
                </div>
                <button type="button" className="hero-control" onClick={() => selectSlide(activeSlide + 1)} aria-label="Next hero slide"><ChevronRight size={19} /></button>
                <button type="button" className="hero-control hero-pause" onClick={() => setIsPaused(!isPaused)} aria-label={isPaused ? "Resume automatic carousel rotation" : "Pause automatic carousel rotation"}>{isPaused ? <Play size={15} /> : <Pause size={15} />}</button>
              </div>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="KwantuHub values">
          <div className="page-shell trust-grid">
            <div><ShieldCheck size={21} /><span><b>Verified diaspora vendors</b><small>Built around real people and storefronts.</small></span></div>
            <div><MapPin size={21} /><span><b>US, CA &amp; MX coverage</b><small>Find community across North America.</small></span></div>
            <div><MessageCircle size={21} /><span><b>Direct community inquiries</b><small>Start a conversation before you commit.</small></span></div>
            <div><Heart size={21} /><span><b>Discovery with dignity</b><small>A platform that puts people before clicks.</small></span></div>
          </div>
        </section>

        <section className="category-section" id="categories">
          <div className="page-shell">
            <div className="section-heading split-heading">
              <div><p className="section-index">02 — Cultural aisles</p><h2>Shop by <em>category.</em></h2></div>
              <p>From hand-dyed adire and specialty spices to Yorùbá tutors and wedding planners. Find what carries home forward.</p>
            </div>
            <div className="category-runway">
              <a className="category-lead" href="#vendors">
                <img src={categories[0].image} alt="A diaspora textile maker holding a hand-dyed textile" />
                <div className="category-lead-copy"><span>01 / Lead aisle</span><h3>{categories[0].name}</h3><p>{categories[0].detail}</p><b>Enter the textile room <ArrowRight size={17} /></b></div>
              </a>
              <div className="category-support">
                {categories.slice(1).map((category, index) => (
                  <a className="category-mini" href="#vendors" key={category.name}>
                    <div className="category-mini-image"><img src={category.image} alt="" /><span>{String(index + 2).padStart(2, "0")}</span></div>
                    <div><p>{category.count}</p><h3>{category.name}</h3><small>{category.detail}</small></div>
                    <MoveUpRight size={17} aria-hidden="true" />
                  </a>
                ))}
                <button className="explore-all-card" type="button" onClick={() => notify("The full cultural directory is coming soon.")}>
                  <span className="gradient-rule" />
                  <b>Explore all<br /><em>22 cultural aisles</em></b>
                  <ArrowRight size={22} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="featured-section" id="vendors">
          <div className="page-shell">
            <div className="section-heading featured-heading">
              <div><p className="section-index">03 — From the community</p><h2>Meet the <em>makers.</em></h2></div>
              <button className="quiet-link" type="button" onClick={() => notify("Featured vendor archive is coming soon.")}>View all vendors <ArrowRight size={17} /></button>
            </div>
            <div className="vendor-grid">
              {vendors.map((vendor, index) => (
                <article className={`vendor-card ${index === 0 ? "lead-vendor" : ""}`} key={vendor.name}>
                  <div className="vendor-image-wrap"><img src={vendor.image} alt="" />{index === 0 && <img className="vendor-knot" src="/manus-storage/Kwantu-identity_352aec3a.svg" alt="" />}<span><Check size={12} /> Verified vendor</span></div>
                  <div className="vendor-card-body">
                    <span className="vendor-story-tag">Maker’s note {String(index + 1).padStart(2, "0")}</span>
                    <p>{vendor.category}</p>
                    <h3>{vendor.name}</h3>
                    <span className="vendor-location"><MapPin size={14} />{vendor.place}</span>
                    <button type="button" onClick={() => notify(`${vendor.name} storefront is coming soon.`)}>View storefront <ArrowRight size={16} /></button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="story-section">
          <div className="story-image"><img src={assets.wellness} alt="Diaspora herbal tea and handmade tableware" /></div>
          <div className="story-copy">
            <p className="section-index">04 — Why KwantuHub</p>
            <blockquote>“We built KwantuHub because finding home shouldn’t require a six-hour flight.”</blockquote>
            <p className="founder-name">Stephen Georgewill <span>Co-Founder</span></p>
            <a className="story-link" href="/about">Read our story <ArrowRight size={18} /></a>
          </div>
        </section>

        <section className="language-section" id="languages">
          <div className="page-shell language-layout">
            <div><p className="section-index">05 — Pass it on</p><h2>Language is a<br /><em>living address.</em></h2><p>Find tutors, cultural immersion classes, and people who make space for the words you want to keep close.</p><button className="button button-dark" type="button" onClick={() => notify("Language tutor discovery is coming soon.")}>Find a tutor <ArrowRight size={17} /></button></div>
            <div className="language-cloud" aria-label="Diaspora languages">
              {languages.map((language, index) => <button type="button" onClick={() => notify(`${language} listings are coming soon.`)} key={language} className={index % 5 === 0 ? "featured-language" : ""}>{language}</button>)}
            </div>
          </div>
        </section>

        <section className="impact-section" id="weddings">
          <div className="page-shell impact-grid">
            <div className="impact-intro"><p className="section-index">06 — Growing together</p><h2>Built for the<br /><em>long way home.</em></h2></div>
            <div className="impact-stat"><b>12,400</b><span>Onboarded vendors</span></div>
            <div className="impact-stat"><b>47</b><span>Origin countries</span></div>
            <div className="impact-stat"><b>40<span>+</span></b><span>Languages supported</span></div>
          </div>
        </section>
      </main>
      <SiteFooter onNotice={notify} />
      {notice && <div className="notice" role="status"><Check size={16} /> {notice}</div>}
    </div>
  );
}
