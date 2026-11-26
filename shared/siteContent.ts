import { z } from "zod";

export const safeContentLink = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(value => {
    if (/[\u0000-\u0020\\]/.test(value)) return false;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an internal path or an HTTPS link without credentials.");

export const heroContentSchema = z.object({
  label: z.string().trim().min(1).max(160),
  eyebrow: z.string().trim().min(1).max(160),
  headline: z.string().trim().min(1).max(120),
  emphasis: z.string().trim().max(120),
  description: z.string().trim().min(1).max(1000),
  primaryLabel: z.string().trim().min(1).max(80),
  primaryHref: safeContentLink,
  secondaryLabel: z.string().trim().min(1).max(80),
  secondaryHref: safeContentLink,
  note: z.string().trim().max(300),
  image: z.string().trim().min(1).max(1024),
  alt: z.string().trim().min(1).max(240),
});
export type HeroContent = z.infer<typeof heroContentSchema>;
export type HeroSlide = HeroContent & { id: string };

export const defaultHeroSlides: HeroSlide[] = [
  {
    id: "01",
    label: "The marketplace introduction",
    eyebrow: "KWANTUHUB: THE AFRICAN DIASPORA MARKETPLACE",
    headline: "Where the diaspora",
    emphasis: "finds home.",
    description:
      "Fabrics, food, language tutors, and wedding services from verified diaspora creators across North America.",
    primaryLabel: "Explore Marketplace",
    primaryHref: "/marketplace",
    secondaryLabel: "List Your Business",
    secondaryHref: "/vendor/onboarding",
    note: "Meet the people behind the work before you make an inquiry.",
    image: "/media/public/kwantu-hero-fashion-maker_20399257_99e7dc6b.jpg",
    alt: "Diaspora textile vendor arranging a hand-dyed textile",
  },
  {
    id: "02",
    label: "Featured vendor spotlight",
    eyebrow: "VENDOR'S NOTE — VERIFIED VENDOR",
    headline: "Meet the hands",
    emphasis: "behind the heirloom.",
    description:
      "Aunty Eki’s Ankara brings hand-selected textiles, thoughtful styling, and the energy of a familiar market stall to Houston and beyond.",
    primaryLabel: "Explore Aunty Eki’s archive",
    primaryHref: "/vendors/aunty-eki-s-ankara",
    secondaryLabel: "Meet more vendors",
    secondaryHref: "/vendors",
    note: "One storefront, a lifetime of pattern, ceremony, and memory.",
    image: "/media/public/kwantu-ceremony-tailor_6da99e5d_14bae697.jpg",
    alt: "Tailor preparing a garment for a family celebration",
  },
  {
    id: "03",
    label: "Cultural language and heritage",
    eyebrow: "HERITAGE CONNECTION — LIVE TUTORING",
    headline: "Language is a",
    emphasis: "living address.",
    description:
      "Gentle, family-centred Yorùbá sessions, conversational circles, and tutors who keep the sounds of home alive across time zones.",
    primaryLabel: "Browse Language Offerings",
    primaryHref: "/marketplace?category=education-learning",
    secondaryLabel: "Explore All Services",
    secondaryHref: "/marketplace?type=service",
    note: "Small group circles and one-on-one immersion classes.",
    image: "/media/public/kwantu-tutor-family_96516297_e66523e7.jpg",
    alt: "Family enjoying language storytelling session together",
  },
];
