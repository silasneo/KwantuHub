import {
  PrismaClient,
  Role,
  ListingType,
  ListingStatus,
  ApprovalStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const categories = [
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
    email: "demo.vendor.eki@kwantuhub.local",
    name: "Demo Vendor — Aunty Eki",
    businessName: "Aunty Eki's Ankara",
    location: "Houston, TX",
    category: "fashion-textiles",
    titles: [
      "Hand-selected Ankara Textile Edit",
      "Aso-Oke Occasion Styling",
      "Custom Ankara Family Set",
    ],
  },
  {
    email: "demo.vendor.spice@kwantuhub.local",
    name: "Demo Vendor — Spice Route",
    businessName: "Spice Route Kenya",
    location: "Minneapolis, MN",
    category: "african-food-groceries",
    titles: [
      "Diaspora Pantry Starter Box",
      "Kenyan Tea & Spice Collection",
      "East African Sunday Table Kit",
    ],
  },
  {
    email: "demo.vendor.yoruba@kwantuhub.local",
    name: "Demo Vendor — Studio Yoruba",
    businessName: "Studio Yoruba",
    location: "Chicago, IL",
    category: "education-learning",
    titles: [
      "Live Yoruba Conversation Sessions",
      "Cultural Immersion for Families",
      "Yoruba Names & Meaning Workshop",
    ],
  },
  {
    email: "demo.vendor.braids@kwantuhub.local",
    name: "Demo Vendor — Mama Africa",
    businessName: "Mama Africa Braids",
    location: "Toronto, ON",
    category: "beauty-personal-care",
    titles: [
      "Protective Styling Consultation",
      "Natural Hair Care Session",
      "Bridal Braiding Consultation",
    ],
  },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash("DemoPass123!", 12);
  const categoryMap = new Map<string, string>();
  let demoListingId = "";
  let demoVendorProfileId = "";
  let demoVendorUserId = "";

  for (const [slug, name] of categories) {
    const category = await prisma.category.upsert({
      where: { slug },
      update: { name },
      create: {
        slug,
        name,
        sortOrder: categories.findIndex((item) => item[0] === slug),
      },
    });
    categoryMap.set(slug, category.id);
  }

  await prisma.user.upsert({
    where: { email: "admin@kwantuhub.local" },
    update: { name: "KwantuHub Demo Admin", passwordHash, role: Role.ADMIN },
    create: {
      email: "admin@kwantuhub.local",
      name: "KwantuHub Demo Admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });
  const demoBuyer = await prisma.user.upsert({
    where: { email: "demo.buyer@kwantuhub.local" },
    update: { name: "KwantuHub Demo Buyer", passwordHash, role: Role.BUYER },
    create: {
      email: "demo.buyer@kwantuhub.local",
      name: "KwantuHub Demo Buyer",
      passwordHash,
      role: Role.BUYER,
    },
  });
  const pendingVendor = await prisma.user.upsert({
    where: { email: "demo.vendor.pending@kwantuhub.local" },
    update: { name: "Demo Pending Vendor", passwordHash, role: Role.VENDOR },
    create: {
      email: "demo.vendor.pending@kwantuhub.local",
      name: "Demo Pending Vendor",
      passwordHash,
      role: Role.VENDOR,
    },
  });
  await prisma.vendorProfile.upsert({
    where: { userId: pendingVendor.id },
    update: {
      businessName: "Demo Pending Studio",
      description:
        "Clearly labelled pending demo vendor for admin moderation testing.",
      location: "Atlanta, GA",
      approvalStatus: ApprovalStatus.PENDING,
      approvedAt: null,
    },
    create: {
      userId: pendingVendor.id,
      businessName: "Demo Pending Studio",
      description:
        "Clearly labelled pending demo vendor for admin moderation testing.",
      location: "Atlanta, GA",
      approvalStatus: ApprovalStatus.PENDING,
    },
  });

  for (const vendor of demoVendors) {
    const user = await prisma.user.upsert({
      where: { email: vendor.email },
      update: { name: vendor.name, passwordHash, role: Role.VENDOR },
      create: {
        email: vendor.email,
        name: vendor.name,
        passwordHash,
        role: Role.VENDOR,
      },
    });
    const profile = await prisma.vendorProfile.upsert({
      where: { userId: user.id },
      update: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedAt: new Date(),
        businessName: vendor.businessName,
        location: vendor.location,
      },
      create: {
        userId: user.id,
        businessName: vendor.businessName,
        location: vendor.location,
        approvalStatus: ApprovalStatus.APPROVED,
        approvedAt: new Date(),
        description: "Clearly labelled demo vendor for MVP acceptance testing.",
        remoteAvailable: vendor.category === "education-learning",
      },
    });
    const storefront = await prisma.storefront.upsert({
      where: { vendorId: profile.id },
      update: { displayName: vendor.businessName, location: vendor.location },
      create: {
        vendorId: profile.id,
        slug: vendor.businessName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
        displayName: vendor.businessName,
        description: "Clearly labelled demo storefront for the KwantuHub MVP.",
        location: vendor.location,
        remoteAvailable: vendor.category === "education-learning",
      },
    });
    const categoryId = categoryMap.get(vendor.category)!;
    for (const title of vendor.titles) {
      const slug = `${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}-demo`;
      const listing = await prisma.listing.upsert({
        where: { slug },
        update: {
          title: `${title} (Demo)`,
          vendorId: profile.id,
          storefrontId: storefront.id,
          categoryId,
        },
        create: {
          vendorId: profile.id,
          storefrontId: storefront.id,
          categoryId,
          slug,
          title: `${title} (Demo)`,
          description:
            "Clearly labelled demo listing used for MVP acceptance testing. Replace with vendor-authored content before launch.",
          listingType:
            vendor.category === "education-learning" ||
            vendor.category === "beauty-personal-care"
              ? ListingType.SERVICE
              : ListingType.PRODUCT,
          priceIndication: "Contact for details",
          location: vendor.location,
          remoteAvailable: vendor.category === "education-learning",
          status: ListingStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });
      if (
        vendor.email === "demo.vendor.eki@kwantuhub.local" &&
        !demoListingId
      ) {
        demoListingId = listing.id;
        demoVendorProfileId = profile.id;
        demoVendorUserId = user.id;
      }
    }
  }

  if (demoListingId && demoVendorProfileId && demoVendorUserId) {
    await prisma.wishlist.upsert({
      where: {
        buyerId_listingId: { buyerId: demoBuyer.id, listingId: demoListingId },
      },
      update: {},
      create: { buyerId: demoBuyer.id, listingId: demoListingId },
    });
    const existingInquiry = await prisma.inquiry.findFirst({
      where: {
        buyerId: demoBuyer.id,
        listingId: demoListingId,
        subject: "Demo buyer inquiry",
      },
    });
    if (!existingInquiry) {
      await prisma.inquiry.create({
        data: {
          buyerId: demoBuyer.id,
          vendorId: demoVendorProfileId,
          listingId: demoListingId,
          subject: "Demo buyer inquiry",
          messages: {
            create: [
              {
                senderId: demoBuyer.id,
                body: "Demo message: Is this available for a family celebration?",
              },
              {
                senderId: demoVendorUserId,
                body: "Demo reply: Yes. Please share your preferred date and quantity.",
              },
            ],
          },
        },
      });
    }
  }
}

main().finally(() => prisma.$disconnect());
