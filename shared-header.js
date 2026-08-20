document.addEventListener("DOMContentLoaded", () => {
  const isBundle = location.protocol === "file:" || location.pathname.includes("/KwantuHub/");
  const logo = isBundle ? "assets/Kwantu-identity.svg" : "/manus-storage/Kwantu-identity_352aec3a.svg";
  const groupData = [
    ["Textiles & style", ["Nigerian & West African Fabrics", "East & Southern African Textiles", "Traditional & Cultural Attire", "Bespoke Diaspora Tailoring", "Handcrafted Jewelry & Accessories"]],
    ["Food & celebration", ["African Foods & Groceries", "Regional Bakery & Fresh Foods", "Specialty Catering & Event Chefs", "Traditional Wedding Services", "Cultural Music & Instruments"]],
    ["Learning & culture", ["Children’s African Language Tutors", "Adult Language & Cultural Immersion", "Diaspora Bookstores & Literature", "African Art & Sculptures", "Faith & Spiritual Goods"]],
    ["Care & home", ["Handwoven Home Décor & Baskets", "Beauty & Natural Hair Care", "African Hair Styling", "Health & Wellness", "Remote Diaspora Professional Services"]],
    ["Life across borders", ["Diaspora Real Estate & Relocation", "Cultural Tourism & Heritage Travel", "Relocation Services", "Housing Services", "Tax/Financial Services"]],
  ];
  const groups = groupData.map(([title, items], index) => `<section class="kw-sh-group"><h3><span>${String(index + 1).padStart(2, "0")}</span>${title}</h3><div>${items.map(item => `<a href="marketplace.html?category=${encodeURIComponent(item)}">${item}</a>`).join("")}</div></section>`).join("");
  const root = document.createElement("div");
  root.className = "kw-sh";
  root.innerHTML = `<div class="kw-sh-utility"><div class="kw-sh-shell"><button>Ship to: 🇺🇸 United States⌄</button><button>◌ English⌄</button></div></div><header><div class="kw-sh-shell kw-sh-main"><a class="kw-sh-brand" href="index.html" aria-label="KwantuHub home"><img src="${logo}" alt="Kwantu heritage knot"><span>KwantuHub</span></a><form class="kw-sh-search" id="search-form"><input id="query" aria-label="Search KwantuHub" placeholder="Search fabrics, foods, tutors, wedding services…"><select id="city" aria-label="Choose a city"><option>All Cities</option><option>Houston, TX</option><option>Toronto, ON</option><option>Chicago, IL</option><option>Minneapolis, MN</option></select><button aria-label="Search">⌕</button></form><nav class="kw-sh-actions"><button>Inquiries</button><button>Favorites</button><a href="vendor-assets.html">Vendor Portal</a></nav><button class="kw-sh-mobile" aria-label="Open navigation" aria-expanded="false">☰</button></div><nav class="kw-sh-nav"><div class="kw-sh-shell"><span class="kw-sh-index">Market index</span><button class="kw-sh-categories" aria-expanded="false">Categories⌄</button><a href="index.html#vendors">Featured Vendors</a><a href="index.html#languages">Languages &amp; Tutors</a><a href="index.html#weddings">Weddings</a><a href="marketplace.html?category=Foods%20%26%20Catering">Foods &amp; Groceries</a><a href="marketplace.html">Trending</a><a href="marketplace.html?category=Relocation%20%26%20Services">Business Services</a><a href="about.html">About KwantuHub ↗</a></div></nav><div class="kw-sh-mega"><div class="kw-sh-shell kw-sh-mega-inner"><aside class="kw-sh-intro"><p>The market index</p><h2>Find what<br><em>holds you close.</em></h2><a href="marketplace.html">Explore all categories ↗</a></aside><div class="kw-sh-groups">${groups}</div></div></div></header>`;
  const utility = document.querySelector(".utility");
  const header = document.querySelector("header");
  if (utility) utility.remove();
  if (header) header.replaceWith(root); else document.body.prepend(root);
  const nav = root.querySelector(".kw-sh-nav"), mega = root.querySelector(".kw-sh-mega"), cat = root.querySelector(".kw-sh-categories"), mobile = root.querySelector(".kw-sh-mobile");
  const close = () => { mega.classList.remove("open"); cat.classList.remove("is-active"); cat.setAttribute("aria-expanded", "false"); nav.classList.remove("open"); mobile.setAttribute("aria-expanded", "false"); mobile.textContent = "☰"; };
  cat.addEventListener("click", () => { const open = !mega.classList.contains("open"); mega.classList.toggle("open", open); cat.classList.toggle("is-active", open); cat.setAttribute("aria-expanded", String(open)); });
  mobile.addEventListener("click", () => { const open = !nav.classList.contains("open"); nav.classList.toggle("open", open); mobile.setAttribute("aria-expanded", String(open)); mobile.textContent = open ? "×" : "☰"; if (!open) close(); });
  document.addEventListener("click", event => { if (!root.contains(event.target)) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
});
