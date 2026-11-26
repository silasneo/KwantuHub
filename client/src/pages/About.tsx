import { Link } from "wouter";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

const ABOUT_MEDIA = "/media/public/site/about";

const BELIEFS = [
  {
    title: "Authenticity over algorithm",
    body: "We honor traditional craftsmanship, personal knowledge, and verified heritage rather than asking culture to perform for a feed.",
  },
  {
    title: "Community over extraction",
    body: "Low-barrier discovery and direct inquiry help diaspora entrepreneurs thrive on terms that respect their time and skill.",
  },
  {
    title: "Dignity in every storefront",
    body: "Small-scale vendors deserve a beautiful, enterprise-grade presence that tells the full story behind their work.",
  },
];

const LEADERS = [
  { mark: "01", name: "Stephen Georgewill", role: "Co-Founder, Kwantu Hub LLC" },
  { mark: "02", name: "Adebola Hamed", role: "Co-Founder, Kwantu Hub LLC" },
  { mark: "03", name: "Olatilewa Akerejola", role: "Co-Founder, Kwantu Hub LLC" },
  {
    mark: "+",
    name: "Community Advisory & Vendor Council",
    role: "In conversation with the people who carry the work forward.",
  },
];

const kicker = "mb-4 text-[11px] font-extrabold uppercase tracking-[0.12em]";
const sectionHeading =
  "font-serif text-[44px] font-bold leading-[0.9] tracking-[-0.055em] sm:text-[52px] lg:text-[64px]";

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f0e8dc] text-[#0a0a0a]">
      <SiteHeader />

      <main className="flex-1">
        <section className="py-14 md:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 md:grid-cols-[0.93fr_1.07fr] md:gap-16 md:px-8">
            <div>
              <p className={kicker}>About KwantuHub</p>
              <h1 className="mb-6 max-w-[570px] font-serif text-[52px] font-bold leading-[0.86] tracking-[-0.065em] sm:text-[64px] lg:text-[84px]">
                The diaspora, in <em className="font-medium">one marketplace.</em>
              </h1>
              <p className="max-w-[440px] font-serif text-[21px] font-medium leading-[1.26] text-[#4b4843] md:text-[23px]">
                We are making it easier to find the people, services, and small businesses that turn
                distance into connection.
              </p>
            </div>
            <figure className="relative h-[360px] overflow-hidden rounded-tr-[140px] md:h-[470px]">
              <img
                src={`${ABOUT_MEDIA}/kwantu-bookshop-owner.webp`}
                alt="Independent diaspora bookseller in a neighborhood bookshop"
                className="h-full w-full object-cover"
                width={1600}
                height={2000}
              />
              <figcaption className="absolute bottom-5 right-5 bg-[#0a0a0a] px-4 py-3 font-serif text-lg font-semibold italic leading-[1.05] text-[#f0e8dc]">
                North America,
                <br />
                many ways home.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="mx-auto max-w-[1060px] px-5 py-[74px] md:grid md:grid-cols-[150px_minmax(0,650px)] md:justify-center md:gap-10 md:px-8 md:py-[118px] lg:grid-cols-[210px_minmax(0,720px)] lg:gap-14">
          <aside className="mb-8 pt-3 text-[10px] font-extrabold uppercase tracking-[0.11em] text-[#4b4843] md:mb-0">
            From the founders
            <i className="brand-gradient mt-3.5 block h-[3px] w-12" aria-hidden />
          </aside>
          <article className="relative font-serif">
            <span
              className="absolute -left-1 -top-9 font-serif text-5xl font-bold text-[#d71466] opacity-30 md:-left-12 md:-top-1.5 md:opacity-100"
              aria-hidden
            >
              ”
            </span>
            <p className="mb-6 text-[27px] font-medium leading-[1.17] tracking-[-0.025em] md:text-[30px]">
              Home is more than a place. It is the language we hear at the market, the tailor we trust
              with a celebration, the food we recognize before it reaches the table.
            </p>
            <div className="space-y-6 text-[20px] font-medium leading-[1.48] md:text-[21px]">
              <p>
                KwantuHub began with a familiar feeling: the search for these things should not be a
                scavenger hunt. Across North America, diaspora businesses are already doing the work
                of holding communities together—often without the digital visibility, time, or tools
                that larger marketplaces take for granted.
              </p>
              <p>
                We are building a marketplace that gives that work a dignified front door. A place to
                discover vendors, make a direct inquiry, and find the people whose knowledge, craft,
                and care make cultural life feel possible wherever you are.
              </p>
              <p>
                We do not believe community should be reduced to a transaction. KwantuHub is here to
                make discovery more generous, storefronts more visible, and the route to belonging a
                little shorter.
              </p>
            </div>
            <div className="mt-9 flex flex-col gap-1.5">
              <b className="text-[23px] leading-none">Stephen Georgewill</b>
              <span className="font-sans text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#4b4843]">
                Co-Founder, Kwantu Hub LLC
              </span>
            </div>
          </article>
        </section>

        <section id="beliefs" className="bg-white py-[75px] md:py-[110px]">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="mb-11 grid items-end gap-5 md:grid-cols-[1.25fr_0.65fr] md:gap-12">
              <div>
                <p className={kicker}>What we believe</p>
                <h2 className={sectionHeading}>
                  Principles with
                  <br />
                  <em className="font-medium">a pulse.</em>
                </h2>
              </div>
              <p className="max-w-[390px] font-serif text-xl font-medium leading-[1.35] text-[#4b4843]">
                Every product decision is shaped by respect for cultural knowledge and the people who
                make it available.
              </p>
            </div>
            <div className="grid border-t border-[#0a0a0a]/15 md:grid-cols-3">
              {BELIEFS.map((belief, index) => (
                <article
                  key={belief.title}
                  className={`border-b border-[#0a0a0a]/15 py-7 md:min-h-[285px] md:border-b-0 md:border-r md:pr-9 md:last:border-r-0 ${index > 0 ? "md:pl-8" : ""}`}
                >
                  <span className="text-xs font-extrabold text-[#d71466]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mb-3.5 mt-5 max-w-[260px] font-serif text-[31px] font-bold leading-[0.96] tracking-[-0.04em] md:mt-12">
                    {belief.title}
                  </h3>
                  <p className="max-w-[292px] font-serif text-lg font-medium leading-[1.25] text-[#4b4843]">
                    {belief.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="grid bg-[#0a0a0a] text-[#f0e8dc] md:min-h-[390px] md:grid-cols-[1fr_0.8fr_0.7fr]">
          <div className="h-[270px] overflow-hidden md:h-auto">
            <img
              src={`${ABOUT_MEDIA}/kwantu-ceremony-tailor.webp`}
              alt="Tailor preparing a garment for a celebration"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="flex flex-col justify-center px-5 py-14 md:px-14">
            <p className="mb-6 font-serif text-[31px] font-medium leading-[0.98] tracking-[-0.05em] lg:text-[49px]">
              “The things we seek are often the things that keep us connected.”
            </p>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#fe8129]">
              KwantuHub field notes
            </span>
          </div>
          <div className="hidden overflow-hidden md:block">
            <img
              src={`${ABOUT_MEDIA}/kwantu-jewelry-maker.webp`}
              alt="Jeweler crafting handmade accessories"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </section>

        <section id="leadership" className="py-[75px] md:py-[113px]">
          <div className="mx-auto grid max-w-7xl gap-9 px-5 md:grid-cols-[0.9fr_1.1fr] md:gap-14 md:px-8 lg:gap-[86px]">
            <div>
              <p className={kicker}>People &amp; partners</p>
              <h2 className={sectionHeading}>
                Building the
                <br />
                <em className="font-medium">meeting place.</em>
              </h2>
              <p className="my-5 max-w-[350px] font-serif text-xl font-medium leading-[1.3] text-[#4b4843]">
                KwantuHub is stewarded by people committed to bringing cultural discovery closer to
                the communities it serves.
              </p>
            </div>
            <div className="border-t border-[#0a0a0a]/15">
              {LEADERS.map(leader => (
                <article
                  key={leader.name}
                  className="grid min-h-[88px] grid-cols-[41px_1fr] items-center gap-3 border-b border-[#0a0a0a]/15 py-5"
                >
                  <span className="text-xs font-extrabold text-[#d71466]">{leader.mark}</span>
                  <div>
                    <h3 className="mb-1 font-serif text-[26px] font-bold leading-none tracking-[-0.03em]">
                      {leader.name}
                    </h3>
                    <p className="font-serif text-[15px] font-medium leading-tight text-[#4b4843]">
                      {leader.role}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#0a0a0a] py-[77px] text-center text-[#f0e8dc] md:py-[104px]">
          <div className="mx-auto flex max-w-7xl flex-col items-center px-5 md:px-8">
            <p className={`${kicker} text-[#fe8129]`}>Find your way in</p>
            <h2 className="mb-8 font-serif text-[51px] font-bold leading-[0.89] tracking-[-0.06em] lg:text-[72px]">
              Every good story
              <br />
              starts with an <em className="font-medium">introduction.</em>
            </h2>
            <Link
              href="/marketplace"
              className="brand-gradient inline-flex min-h-[46px] items-center justify-center px-5 text-xs font-bold tracking-[0.035em] text-[#f0e8dc]"
            >
              Explore the marketplace →
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
