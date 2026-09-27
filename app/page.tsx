import Link from "next/link";
export default function Home() {
  return (
    <>
      <main>
        <section className="hero">
          <div className="shell">
            <p className="eyebrow">
              KwantuHub: The African Diaspora Marketplace
            </p>
            <h1>
              Where the diaspora <em>finds home.</em>
            </h1>
            <p>
              Fabrics, food, language tutors, and services from verified
              diaspora creators across North America.
            </p>
            <div className="button-row">
              <Link className="button primary" href="/marketplace">
                Explore marketplace →
              </Link>
              <Link className="button secondary" href="/register?role=VENDOR">
                List your business
              </Link>
            </div>
          </div>
        </section>
        <section className="trust">
          <div className="shell trust-grid">
            <div>
              <b>Verified diaspora vendors</b>
              <br />
              <span>Real people and storefronts.</span>
            </div>
            <div>
              <b>North America coverage</b>
              <br />
              <span>Find community close to home.</span>
            </div>
            <div>
              <b>Direct inquiries</b>
              <br />
              <span>Start a conversation before you commit.</span>
            </div>
            <div>
              <b>Discovery with dignity</b>
              <br />
              <span>People before clicks.</span>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="shell">
            <p className="eyebrow">02 — Cultural aisles</p>
            <h2>
              Shop by <em>category.</em>
            </h2>
            <div className="card-grid">
              <Link
                className="card"
                href="/marketplace?category=fashion-textiles"
              >
                <div className="card-art" />
                <h3>Fashion & Textiles</h3>
                <p>Ankara · Adire · Aso-Oke · Kente</p>
              </Link>
              <Link
                className="card"
                href="/marketplace?category=african-food-groceries"
              >
                <div className="card-art" />
                <h3>Food & Groceries</h3>
                <p>Ingredients · Catering · Specialty foods</p>
              </Link>
              <Link
                className="card"
                href="/marketplace?category=education-learning"
              >
                <div className="card-art" />
                <h3>Education & Learning</h3>
                <p>Language tutors · Cultural immersion</p>
              </Link>
            </div>
          </div>
        </section>
        <section className="section" style={{ background: "#fff" }}>
          <div className="shell">
            <p className="eyebrow">03 — From the community</p>
            <h2>
              Meet the <em>makers.</em>
            </h2>
            <p className="copy">
              Browse a growing community of verified vendors, service providers,
              and cultural entrepreneurs.
            </p>
            <Link className="button primary" href="/marketplace">
              View marketplace →
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
