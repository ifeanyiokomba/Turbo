// Turbopay — Marketplace demo seed data + lazy seeding helper.
// 24 merchants across 8 categories (realistic Nigerian/African brands).

import { db } from "@/lib/db";

export const MARKETPLACE_CATEGORIES = [
  "SHOPPING",
  "FOOD",
  "TRANSPORT",
  "UTILITIES",
  "ENTERTAINMENT",
  "HEALTH",
  "EDUCATION",
  "TRAVEL",
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  SHOPPING: "Shopping",
  FOOD: "Food",
  TRANSPORT: "Transport",
  UTILITIES: "Utilities",
  ENTERTAINMENT: "Entertainment",
  HEALTH: "Health",
  EDUCATION: "Education",
  TRAVEL: "Travel",
};

interface SeedMerchant {
  name: string;
  category: MarketplaceCategory;
  description: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  featured: boolean;
}

const SEED_MERCHANTS: SeedMerchant[] = [
  // SHOPPING (5)
  {
    name: "Jumia",
    category: "SHOPPING",
    description:
      "Africa's largest online marketplace — electronics, fashion, home goods and more. Fast delivery across Nigeria.",
    website: "https://www.jumia.com.ng",
    phone: "+234 700 600 0000",
    email: "support@jumia.com.ng",
    address: "Lagos, Nigeria",
    rating: 4.4,
    reviewCount: 18420,
    verified: true,
    featured: true,
  },
  {
    name: "Konga",
    category: "SHOPPING",
    description:
      "Nigerian e-commerce giant offering phones, computers, appliances and groceries with pay-on-delivery options.",
    website: "https://www.konga.com",
    phone: "+234 700 800 0000",
    email: "help@konga.com",
    address: "Lagos, Nigeria",
    rating: 4.2,
    reviewCount: 9845,
    verified: true,
    featured: true,
  },
  {
    name: "Shoprite",
    category: "SHOPPING",
    description:
      "Leading supermarket chain with fresh groceries, household essentials and exclusive deals every week.",
    website: "https://www.shoprite.com.ng",
    phone: "+234 800 123 4567",
    address: "Multiple locations",
    rating: 4.5,
    reviewCount: 12790,
    verified: true,
    featured: false,
  },
  {
    name: "Slot",
    category: "SHOPPING",
    description:
      "Trusted retailer for mobile phones, tablets and accessories from all major brands with warranty.",
    website: "https://www.slot.ng",
    phone: "+234 700 500 0000",
    address: "Lagos, Nigeria",
    rating: 4.3,
    reviewCount: 5621,
    verified: true,
    featured: false,
  },
  {
    name: "Mr Price",
    category: "SHOPPING",
    description:
      "Trendy fashion retailer offering clothing, footwear and homeware at affordable prices for the whole family.",
    website: "https://www.mrprice.com",
    phone: "+234 800 555 0100",
    address: "Lagos, Nigeria",
    rating: 4.1,
    reviewCount: 3210,
    verified: true,
    featured: false,
  },

  // FOOD (4)
  {
    name: "Chicken Republic",
    category: "FOOD",
    description:
      "Nigeria's favourite fast-food chain serving crispy fried chicken, burgers and African meals at 100+ locations.",
    website: "https://www.chickenrepublic.com",
    phone: "+234 700 225 4246",
    email: "hello@chickenrepublic.com",
    address: "Lagos, Nigeria",
    rating: 4.4,
    reviewCount: 8930,
    verified: true,
    featured: true,
  },
  {
    name: "The Place Restaurant",
    category: "FOOD",
    description:
      "Popular Nigerian restaurant chain serving local delicacies — asun, peppersoup, jollof rice and grilled fish.",
    website: "https://www.theplace.com.ng",
    phone: "+234 809 444 0000",
    address: "Lagos, Nigeria",
    rating: 4.6,
    reviewCount: 4120,
    verified: true,
    featured: false,
  },
  {
    name: "Kilimanjaro",
    category: "FOOD",
    description:
      "Pan-African quick-service restaurant offering continental and African dishes with delivery across major cities.",
    phone: "+234 700 555 4000",
    address: "Lagos, Nigeria",
    rating: 4.3,
    reviewCount: 2870,
    verified: true,
    featured: false,
  },
  {
    name: "Domino's Pizza Nigeria",
    category: "FOOD",
    description:
      "Order hot, fresh pizza, sides and desserts delivered to your door in 30 minutes or less.",
    website: "https://www.dominospizza.ng",
    phone: "+234 700 500 0000",
    address: "Multiple locations",
    rating: 4.2,
    reviewCount: 6745,
    verified: true,
    featured: false,
  },

  // TRANSPORT (3)
  {
    name: "Uber",
    category: "TRANSPORT",
    description:
      "Request a ride in minutes — affordable, reliable rides across Lagos, Abuja and other major cities.",
    website: "https://www.uber.com",
    phone: "+1 415 612 9000",
    address: "San Francisco, USA",
    rating: 4.5,
    reviewCount: 24500,
    verified: true,
    featured: true,
  },
  {
    name: "Bolt",
    category: "TRANSPORT",
    description:
      "Fast, convenient and affordable ride-hailing with upfront pricing and verified drivers across Africa.",
    website: "https://www.bolt.com",
    phone: "+234 700 222 2222",
    address: "Lagos, Nigeria",
    rating: 4.4,
    reviewCount: 18320,
    verified: true,
    featured: true,
  },
  {
    name: "ABC Transport",
    category: "TRANSPORT",
    description:
      "Premium intercity bus service connecting Lagos, Abuja, Port Harcourt and other Nigerian cities.",
    website: "https://www.abctransport.com",
    phone: "+234 803 300 0000",
    address: "Lagos, Nigeria",
    rating: 4.1,
    reviewCount: 1540,
    verified: true,
    featured: false,
  },

  // UTILITIES (3)
  {
    name: "NEPA / AEDC",
    category: "UTILITIES",
    description:
      "Pay your electricity bills instantly — Abuja Electricity Distribution Company and other DISCOs supported.",
    phone: "+234 800 100 0000",
    email: "customercare@aedc.com",
    address: "Abuja, Nigeria",
    rating: 3.9,
    reviewCount: 6200,
    verified: true,
    featured: false,
  },
  {
    name: "DSTV",
    category: "UTILITIES",
    description:
      "Recharge your DStv subscription — access premium sports, movies and entertainment channels.",
    website: "https://www.dstv.com",
    phone: "+234 700 123 9999",
    email: "help@dstv.com",
    address: "Lagos, Nigeria",
    rating: 4.2,
    reviewCount: 14210,
    verified: true,
    featured: true,
  },
  {
    name: "Spectranet",
    category: "UTILITIES",
    description:
      "Fast 4G LTE broadband internet — recharge your data plan and stay connected across Nigeria.",
    website: "https://www.spectranet.com.ng",
    phone: "+234 800 234 5678",
    address: "Lagos, Nigeria",
    rating: 4.0,
    reviewCount: 4980,
    verified: true,
    featured: false,
  },

  // ENTERTAINMENT (3)
  {
    name: "Spotify",
    category: "ENTERTAINMENT",
    description:
      "Stream millions of songs, podcasts and playlists ad-free with Premium. Cancel anytime.",
    website: "https://www.spotify.com",
    phone: "+1 212 555 0100",
    address: "Stockholm, Sweden",
    rating: 4.7,
    reviewCount: 32100,
    verified: true,
    featured: true,
  },
  {
    name: "Netflix",
    category: "ENTERTAINMENT",
    description:
      "Watch award-winning Nollywood and international movies, series and documentaries on any device.",
    website: "https://www.netflix.com",
    phone: "+1 800 555 0100",
    address: "Los Gatos, USA",
    rating: 4.6,
    reviewCount: 41200,
    verified: true,
    featured: true,
  },
  {
    name: "Showmax",
    category: "ENTERTAINMENT",
    description:
      "Stream African and international content, live sports and Showmax Originals anywhere, anytime.",
    website: "https://www.showmax.com",
    phone: "+27 11 555 0100",
    address: "Johannesburg, SA",
    rating: 4.3,
    reviewCount: 8740,
    verified: true,
    featured: false,
  },

  // HEALTH (2)
  {
    name: "PharmaPlus",
    category: "HEALTH",
    description:
      "Order genuine prescription and OTC medicines online with fast doorstep delivery and pharmacist support.",
    website: "https://www.pharmaplus.ng",
    phone: "+234 800 700 0000",
    email: "care@pharmaplus.ng",
    address: "Lagos, Nigeria",
    rating: 4.5,
    reviewCount: 2340,
    verified: true,
    featured: true,
  },
  {
    name: "MedPlus",
    category: "HEALTH",
    description:
      "Pharmacy chain with 80+ branches offering medicines, wellness products and free health checks.",
    website: "https://www.medpluspharmacy.com",
    phone: "+234 800 333 0000",
    address: "Lagos, Nigeria",
    rating: 4.4,
    reviewCount: 3120,
    verified: true,
    featured: false,
  },

  // EDUCATION (2)
  {
    name: "University of Ibadan",
    category: "EDUCATION",
    description:
      "Nigeria's premier university — pay tuition, acceptance fees and accommodation charges online.",
    website: "https://www.ui.edu.ng",
    phone: "+234 805 222 0000",
    email: "bursar@ui.edu.ng",
    address: "Ibadan, Nigeria",
    rating: 4.3,
    reviewCount: 5210,
    verified: true,
    featured: true,
  },
  {
    name: "UNILAG",
    category: "EDUCATION",
    description:
      "University of Lagos — settle school fees, late registration and faculty dues with instant receipts.",
    website: "https://unilag.edu.ng",
    phone: "+234 802 333 0000",
    address: "Lagos, Nigeria",
    rating: 4.2,
    reviewCount: 6430,
    verified: true,
    featured: false,
  },

  // TRAVEL (2)
  {
    name: "Air Peace",
    category: "TRAVEL",
    description:
      "Nigeria's largest airline — book domestic and international flights with flexible payment options.",
    website: "https://www.flyairpeace.com",
    phone: "+234 700 359 2472",
    email: "support@flyairpeace.com",
    address: "Lagos, Nigeria",
    rating: 4.1,
    reviewCount: 7820,
    verified: true,
    featured: true,
  },
  {
    name: "Wakanow",
    category: "TRAVEL",
    description:
      "Book flights, hotels, airport transfers and travel insurance across Africa and beyond — all in one place.",
    website: "https://www.wakanow.com",
    phone: "+234 800 925 2669",
    address: "Lagos, Nigeria",
    rating: 4.3,
    reviewCount: 5490,
    verified: true,
    featured: false,
  },
];

let seedPromise: Promise<void> | null = null;

/** Idempotently seed the marketplace on first access. Runs once per process. */
export function ensureMarketplaceSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    try {
      const count = await db.marketplaceMerchant.count();
      if (count > 0) return;
      await db.marketplaceMerchant.createMany({
        data: SEED_MERCHANTS.map((m) => ({ ...m, status: "ACTIVE" })),
      });
      console.log(`[marketplace] seeded ${SEED_MERCHANTS.length} demo merchants`);
    } catch (e) {
      // Reset so a later call can retry
      seedPromise = null;
      console.error("[marketplace] seed failed", e);
    }
  })();
  return seedPromise;
}
