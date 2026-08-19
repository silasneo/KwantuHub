/**
 * Diaspora Market Almanac: editorial founder narrative preserving the warm paper, black ink, and circular-lens visual language.
 */
import { ArrowRight, Quote } from "lucide-react";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

const assets = {
  hero: "/manus-storage/kwantu-bookshop-owner_6310a59b.jpg",
  textiles: "/manus-storage/kwantu-ceremony-tailor_6da99e5d.jpg",
  craft: "/manus-storage/kwantu-jewelry-maker_625113de.jpg",
};

export default function About() {
  const [notice, setNotice] = useState("");
  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  return (
    <div className="app-frame about-page">
      <SiteHeader onNotice={notify} />
      <main>
        <section className="about-hero">
          <div className="page-shell about-hero-inner">
            <div className="about-hero-copy"><p className="section-index">About KwantuHub — 2026</p><h1>The diaspora, in <em>one marketplace.</em></h1><p>We are making it easier to find the people, services, and small businesses that turn distance into connection.</p></div>
            <div className="about-hero-image"><img src={assets.hero} alt="Independent diaspora bookseller in a neighborhood bookshop" /><div className="about-image-caption">North America,<br />many ways home.</div></div>
          </div>
        </section>

        <section className="letter-section">
          <div className="letter-aside"><span>From the founders</span><div className="gradient-rule" /></div>
          <article className="founder-letter">
            <Quote className="letter-quote" size={40} />
            <p className="letter-lead">Home is more than a place. It is the language we hear at the market, the tailor we trust with a celebration, the food we recognize before it reaches the table.</p>
            <p>KwantuHub began with a familiar feeling: the search for these things should not be a scavenger hunt. Across North America, diaspora businesses are already doing the work of holding communities together—often without the digital visibility, time, or tools that larger marketplaces take for granted.</p>
            <p>We are building a marketplace that gives that work a dignified front door. A place to discover vendors, make a direct inquiry, and find the people whose knowledge, craft, and care make cultural life feel possible wherever you are.</p>
            <p>We do not believe community should be reduced to a transaction. KwantuHub is here to make discovery more generous, storefronts more visible, and the route to belonging a little shorter.</p>
            <div className="letter-signature"><b>Stephen Georgewill</b><span>Co-Founder, Kwantu Hub LLC</span></div>
          </article>
        </section>

        <section className="beliefs-section">
          <div className="page-shell"><div className="section-heading split-heading"><div><p className="section-index">What we believe</p><h2>Principles with<br /><em>a pulse.</em></h2></div><p>Every product decision is shaped by respect for cultural knowledge and the people who make it available.</p></div>
            <div className="belief-grid">
              <article><span>01</span><h3>Authenticity over algorithm</h3><p>We honor traditional craftsmanship, personal knowledge, and verified heritage rather than asking culture to perform for a feed.</p></article>
              <article><span>02</span><h3>Community over extraction</h3><p>Low-barrier discovery and direct inquiry help diaspora entrepreneurs thrive on terms that respect their time and skill.</p></article>
              <article><span>03</span><h3>Dignity in every storefront</h3><p>Small-scale vendors deserve a beautiful, enterprise-grade presence that tells the full story behind their work.</p></article>
            </div>
          </div>
        </section>

        <section className="about-image-band"><div className="image-band-main"><img src={assets.textiles} alt="Tailor preparing a garment for a celebration" /></div><div className="image-band-quote"><p>“The things we seek are often the things that keep us connected.”</p><span>KwantuHub field notes</span></div><div className="image-band-small"><img src={assets.craft} alt="Jeweler crafting handmade accessories" /></div></section>

        <section className="leadership-section"><div className="page-shell leadership-layout"><div><p className="section-index">People &amp; partners</p><h2>Building the<br /><em>meeting place.</em></h2><p>KwantuHub is stewarded by people committed to bringing cultural discovery closer to the communities it serves.</p></div><div className="leadership-list"><article><span>01</span><div><h3>Stephen Georgewill</h3><p>Co-Founder, Kwantu Hub LLC</p></div></article><article><span>02</span><div><h3>Adebola</h3><p>Co-Founder, Kwantu Hub LLC</p></div></article><article><span>03</span><div><h3>Lady T</h3><p>Co-Founder, Kwantu Hub LLC</p></div></article><article className="council"><span>+</span><div><h3>Community Advisory &amp; Vendor Council</h3><p>In conversation with the people who carry the work forward.</p></div></article></div></div></section>

        <section className="about-cta"><div className="page-shell"><p className="section-index">Find your way in</p><h2>Every good story<br />starts with an <em>introduction.</em></h2><a href="/" className="button button-primary">Explore the marketplace <ArrowRight size={18} /></a></div></section>
      </main>
      <SiteFooter onNotice={notify} />
      {notice && <div className="notice" role="status">{notice}</div>}
    </div>
  );
}
