import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  categories,
  users,
  vendorProfiles,
  storefronts,
  listings,
  listingMedia,
  wishlists,
  inquiries,
  messages,
  reviews,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const categoryList = [
  ["african-food-groceries", "African Food & Groceries"],
  ["fashion-textiles", "Fashion & Textiles"],
  ["beauty-personal-care", "Beauty & Personal Care"],
  ["arts-crafts-culture", "Arts, Crafts & Culture"],
  ["home-living", "Home & Living"],
  ["professional-business-services", "Professional & Business Services"],
  ["education-learning", "Education & Learning"],
  ["events-celebrations", "Events & Celebrations"],
  ["travel-experiences", "Travel & Experiences"],
  ["health-wellness", "Health & Wellness"],
  ["media-music-entertainment", "Media, Music & Entertainment"],
  ["family-community", "Family & Community"],
  ["real-estate-housing", "Real Estate & Housing"],
  ["automotive-transport", "Automotive & Transport"],
  ["agriculture-african-products", "Agriculture & African Products"],
  ["jobs-opportunities", "Jobs & Opportunities"],
  ["community-organizations", "Community & Organizations"],
  ["other-general", "Other / General"],
] as const;

const demoVendors = [
  {
    openId: "demo-vendor-eki",
    name: "Aunty Eki",
    email: "demo.vendor.eki@kwantuhub.local",
    businessName: "Aunty Eki's Ankara",
    location: "Houston, TX",
    phone: "+1 713 555 0148",
    whatsapp: "+1 713 555 0148",
    imessage: "eki@auntyekis.example",
    instagram: "@auntyekisankara",
    contactEmail: "hello@auntyekis.example",
    category: "fashion-textiles",
    headline: "Cloth that carries memory",
    description:
      "Curated Nigerian Ankara prints, hand-dyed adire, and occasion wear for the diaspora across North America.",
    logoUrl: "/manus-storage/kwantu-ceremony-tailor_6da99e5d_14bae697.jpg",
    coverUrl: "/manus-storage/kwantu-hero-fashion-maker_20399257_99e7dc6b.jpg",
    items: [
      {
        slug: "adire-silk",
        title: "Hand-Dyed Adire Occasion Fabric — 5 Yards",
        description:
          "A rich hand-dyed adire textile selected by Aunty Eki's Ankara for occasion dressing and heirloom tailoring. The pattern carries a vivid indigo story with a versatile five-yard cut.",
        price: "$85.00",
        type: "product" as const,
        image: "/manus-storage/kwantu-ceremony-tailor_6da99e5d_14bae697.jpg",
        gallery: [
          "/manus-storage/kwantu-ceremony-tailor_6da99e5d_14bae697.jpg",
          "/manus-storage/kwantu-hero-fashion-maker_20399257_99e7dc6b.jpg",
          "/manus-storage/kwantu-christmas-market_9ea74b26_1a8e6c12.jpg",
        ],
        size: "tall",
      },
      {
        slug: "ankara-wrap",
        title: "Ankara Celebration Wrap",
        description:
          "A joyful Ankara wrap for gatherings, gifting, and everyday expression, selected from Aunty Eki's rotating fabric archive.",
        price: "$74.00",
        type: "product" as const,
        image: "/manus-storage/kwantu-hero-fashion-maker_20399257_99e7dc6b.jpg",
        size: "short",
      },
    ],
  },
  {
    openId: "demo-vendor-spice",
    name: "Spice Route Team",
    email: "demo.vendor.spice@kwantuhub.local",
    businessName: "Spice Route Kenya",
    location: "Minneapolis, MN",
    phone: "+1 612 555 0182",
    whatsapp: "+1 612 555 0182",
    instagram: "@spiceroutekenya",
    contactEmail: "hello@spiceroute.example",
    category: "african-food-groceries",
    headline: "Fresh pantry staples delivered across the US",
    description:
      "East African teas, berbere spices, and essential pantry staples delivered fresh to your door.",
    logoUrl: "/manus-storage/kwantu-hero-caterer_500a9501_b0867b9e.jpg",
    coverUrl: "/manus-storage/kwantu-wellness-tea_06aa39c7_ad80b8bd.jpg",
    items: [
      {
        slug: "kenyan-feast",
        title: "East African Celebration Catering",
        description:
          "Spice Route Kenya prepares East African menus for home celebrations, cultural events, and office gatherings, with every table shaped around hospitality.",
        price: "From $180",
        type: "service" as const,
        image: "/manus-storage/kwantu-hero-caterer_500a9501_b0867b9e.jpg",
        size: "tall",
      },
      {
        slug: "suya-spice",
        title: "Suya Spice & Smoky Pepper Blend",
        description:
          "A fragrant spice mix by Spice Route Kenya, blended for roasted vegetables, grilled proteins, and deep, smoky comfort.",
        price: "$18.00",
        type: "product" as const,
        image: "/manus-storage/kwantu-wellness-tea_06aa39c7_ad80b8bd.jpg",
        size: "short",
      },
    ],
  },
  {
    openId: "demo-vendor-yoruba",
    name: "Studio Yorùbá Team",
    email: "demo.vendor.yoruba@kwantuhub.local",
    businessName: "Studio Yorùbá",
    location: "Chicago, IL",
    phone: "+1 312 555 0130",
    whatsapp: "+1 312 555 0130",
    instagram: "@studioyoruba",
    contactEmail: "hello@studioyoruba.example",
    category: "education-learning",
    headline: "Language, heritage, and story circles for all ages",
    description:
      "Live interactive Yoruba conversation sessions and cultural discovery workshops.",
    logoUrl: "/manus-storage/kwantu-tutor-family_96516297_e66523e7.jpg",
    coverUrl: "/manus-storage/kwantu-tutor-family_96516297_e66523e7.jpg",
    items: [
      {
        slug: "yoruba-immersion",
        title: "1-on-1 Yorùbá Language Immersion for Kids",
        description:
          "Studio Yorùbá offers one-to-one sessions that give children a warm place to hear, practise, and carry language into daily family life.",
        price: "$35 / hr",
        type: "service" as const,
        image: "/manus-storage/kwantu-tutor-family_96516297_e66523e7.jpg",
        size: "short",
      },
      {
        slug: "yoruba-circle",
        title: "Yorùbá Conversation Circle",
        description:
          "A conversational setting for adults building confidence with Yorùbá sounds, everyday phrases, and cultural context.",
        price: "$20 / session",
        type: "service" as const,
        image: "/manus-storage/kwantu-tutor-family_96516297_e66523e7.jpg",
        size: "tall",
      },
    ],
  },
  {
    openId: "demo-vendor-braids",
    name: "Mama Africa",
    email: "demo.vendor.braids@kwantuhub.local",
    businessName: "Mama Africa Braids",
    location: "Toronto, ON",
    phone: "+1 416 555 0166",
    whatsapp: "+1 416 555 0166",
    instagram: "@mamaafricabraids",
    contactEmail: "hello@mamaafrica.example",
    category: "beauty-personal-care",
    headline: "Protective styling and natural crown care",
    description:
      "Expert braiding, loc maintenance, and bespoke bridal hair consultations.",
    logoUrl: "/manus-storage/kwantu-braider_2d92759f_6d3ffd6a.jpg",
    coverUrl: "/manus-storage/kwantu-braider_2d92759f_6d3ffd6a.jpg",
    items: [
      {
        slug: "braid-consult",
        title: "Knotless Braids & Natural Hair Consultation",
        description:
          "Mama Africa Braids combines tailored consultation with protective styling, so every appointment begins with healthy hair and your desired look.",
        price: "$160.00",
        type: "service" as const,
        image: "/manus-storage/kwantu-braider_2d92759f_6d3ffd6a.jpg",
        size: "tall",
      },
      {
        slug: "natural-hair-ritual",
        title: "Natural Hair Ritual & Scalp Care",
        description:
          "A focused natural-hair care session from Mama Africa Braids, centred on scalp wellbeing, moisture, and sustainable maintenance.",
        price: "$70.00",
        type: "service" as const,
        image: "/manus-storage/kwantu-braider_2d92759f_6d3ffd6a.jpg",
        size: "short",
      },
    ],
  },
];

async function seed() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  const sharedPasswordHash = await bcrypt.hash("DemoPass123!", 10);

  console.log("Seeding categories...");
  const categoryMap = new Map<string, number>();
  for (let i = 0; i < categoryList.length; i++) {
    const [slug, name] = categoryList[i];
    const existing = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    if (existing.length === 0) {
      const [res] = await db.insert(categories).values({
        slug,
        name,
        sortOrder: i,
        isActive: true,
      });
      categoryMap.set(slug, res.insertId);
    } else {
      categoryMap.set(slug, existing[0].id);
    }
  }

  console.log("Seeding admin and buyer users with JWT credentials...");
  let adminId: number;
  const existingAdmin = await db
    .select()
    .from(users)
    .where(eq(users.email, "admin@kwantuhub.local"))
    .limit(1);
  if (existingAdmin.length === 0) {
    const [res] = await db.insert(users).values({
      openId: "kwantuhub-admin",
      name: "KwantuHub Platform Admin",
      email: "admin@kwantuhub.local",
      passwordHash: sharedPasswordHash,
      avatarUrl:
        "https://api.dicebear.com/7.x/initials/svg?seed=Admin&backgroundColor=0a0a0a",
      role: "admin",
      status: "active",
    });
    adminId = res.insertId;
  } else {
    adminId = existingAdmin[0].id;
    await db
      .update(users)
      .set({
        passwordHash: sharedPasswordHash,
        avatarUrl:
          "https://api.dicebear.com/7.x/initials/svg?seed=Admin&backgroundColor=0a0a0a",
      })
      .where(eq(users.id, adminId));
  }

  let buyerId: number;
  const existingBuyer = await db
    .select()
    .from(users)
    .where(eq(users.email, "demo.buyer@kwantuhub.local"))
    .limit(1);
  if (existingBuyer.length === 0) {
    const [res] = await db.insert(users).values({
      openId: "kwantuhub-buyer",
      name: "Chioma Okonjo",
      email: "demo.buyer@kwantuhub.local",
      passwordHash: sharedPasswordHash,
      avatarUrl:
        "https://api.dicebear.com/7.x/initials/svg?seed=Chioma&backgroundColor=d71466",
      role: "buyer",
      status: "active",
    });
    buyerId = res.insertId;
  } else {
    buyerId = existingBuyer[0].id;
    await db
      .update(users)
      .set({
        passwordHash: sharedPasswordHash,
        avatarUrl:
          "https://api.dicebear.com/7.x/initials/svg?seed=Chioma&backgroundColor=d71466",
      })
      .where(eq(users.id, buyerId));
  }

  console.log("Seeding vendors with prototype media and catalog offerings...");
  for (const v of demoVendors) {
    let vUserId: number;
    const existingU = await db
      .select()
      .from(users)
      .where(eq(users.email, v.email))
      .limit(1);
    if (existingU.length === 0) {
      const [u] = await db.insert(users).values({
        openId: v.openId,
        name: v.name,
        email: v.email,
        passwordHash: sharedPasswordHash,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(v.name)}&backgroundColor=fe8129`,
        role: "vendor",
        status: "active",
      });
      vUserId = u.insertId;
    } else {
      vUserId = existingU[0].id;
      await db
        .update(users)
        .set({
          passwordHash: sharedPasswordHash,
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(v.name)}&backgroundColor=fe8129`,
        })
        .where(eq(users.id, vUserId));
    }

    let vProfileId: number;
    const existingP = await db
      .select()
      .from(vendorProfiles)
      .where(eq(vendorProfiles.userId, vUserId))
      .limit(1);
    if (existingP.length === 0) {
      const [p] = await db.insert(vendorProfiles).values({
        userId: vUserId,
        businessName: v.businessName,
        phone: (v as any).phone,
        whatsapp: (v as any).whatsapp,
        imessage: (v as any).imessage,
        instagram: (v as any).instagram,
        contactEmail: (v as any).contactEmail,
        description: v.description,
        location: v.location,
        serviceArea: "North America",
        approvalStatus: "approved",
        approvedAt: new Date(),
        remoteAvailable: v.category === "education-learning",
      });
      vProfileId = p.insertId;
    } else {
      vProfileId = existingP[0].id;
      await db
        .update(vendorProfiles)
        .set({
          businessName: v.businessName,
          phone: (v as any).phone,
          whatsapp: (v as any).whatsapp,
          imessage: (v as any).imessage,
          instagram: (v as any).instagram,
          contactEmail: (v as any).contactEmail,
          description: v.description,
          location: v.location,
          approvalStatus: "approved",
        })
        .where(eq(vendorProfiles.id, vProfileId));
    }

    const vSlug = v.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    let storefrontId: number;
    const existingS = await db
      .select()
      .from(storefronts)
      .where(eq(storefronts.vendorId, vProfileId))
      .limit(1);
    if (existingS.length === 0) {
      const [s] = await db.insert(storefronts).values({
        vendorId: vProfileId,
        slug: vSlug,
        displayName: v.businessName,
        headline: v.headline,
        description: v.description,
        location: v.location,
        serviceArea: "North America",
        remoteAvailable: v.category === "education-learning",
        logoUrl: v.logoUrl,
        coverUrl: v.coverUrl,
      });
      storefrontId = s.insertId;
    } else {
      storefrontId = existingS[0].id;
      await db
        .update(storefronts)
        .set({
          displayName: v.businessName,
          headline: v.headline,
          description: v.description,
          logoUrl: v.logoUrl,
          coverUrl: v.coverUrl,
        })
        .where(eq(storefronts.id, storefrontId));
    }

    const catId = categoryMap.get(v.category) || 1;
    for (const item of v.items) {
      const existingL = await db
        .select()
        .from(listings)
        .where(eq(listings.slug, item.slug))
        .limit(1);
      let lId: number;
      if (existingL.length === 0) {
        const [l] = await db.insert(listings).values({
          slug: item.slug,
          vendorId: vProfileId,
          storefrontId,
          categoryId: catId,
          title: item.title,
          description: item.description,
          listingType: item.type,
          priceIndication: item.price,
          location: v.location,
          remoteAvailable: v.category === "education-learning",
          status: "published",
          publishedAt: new Date(),
        });
        lId = l.insertId;
      } else {
        lId = existingL[0].id;
        await db
          .update(listings)
          .set({
            title: item.title,
            description: item.description,
            priceIndication: item.price,
            status: "published",
          })
          .where(eq(listings.id, lId));
      }

      // Add media gallery
      await db.delete(listingMedia).where(eq(listingMedia.listingId, lId));
      const urls = (item as any).gallery || [item.image];
      await db.insert(listingMedia).values(
        urls.map((url: string, idx: number) => ({
          listingId: lId,
          url,
          altText: `${item.title} image ${idx + 1}`,
          sortOrder: idx,
        }))
      );
    }
  }

  const [adire] = await db
    .select()
    .from(listings)
    .where(eq(listings.slug, "adire-silk"))
    .limit(1);
  if (adire) {
    await db.delete(reviews).where(eq(reviews.listingId, adire.id));
    await db.insert(reviews).values({
      listingId: adire.id,
      vendorId: adire.vendorId,
      buyerId,
      rating: 5,
      comment:
        "The fabric arrived beautifully packaged and the indigo story is even better in person.",
      status: "approved",
    });
  }

  console.log(
    "Seed updated successfully with JWT credentials and prototype assets!"
  );
  await connection.end();
}

seed().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
