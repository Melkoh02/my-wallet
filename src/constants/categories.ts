/**
 * Map of default English category/subcategory names to i18n keys.
 * Used for display-time translation of seeded categories.
 */
export const DEFAULT_NAME_KEYS: Record<string, string> = {
  // Categories
  "Food & Dining": "defaultCategories.foodDining",
  Transport: "defaultCategories.transport",
  Housing: "defaultCategories.housing",
  Shopping: "defaultCategories.shopping",
  Entertainment: "defaultCategories.entertainment",
  Health: "defaultCategories.health",
  Education: "defaultCategories.education",
  Personal: "defaultCategories.personal",
  Salary: "defaultCategories.salary",
  Freelance: "defaultCategories.freelance",
  Investments: "defaultCategories.investments",
  "Other Income": "defaultCategories.otherIncome",
  // Subcategories
  Groceries: "defaultCategories.groceries",
  Restaurants: "defaultCategories.restaurants",
  Coffee: "defaultCategories.coffee",
  "Fast Food": "defaultCategories.fastFood",
  Delivery: "defaultCategories.delivery",
  Fuel: "defaultCategories.fuel",
  "Public Transit": "defaultCategories.publicTransit",
  "Ride Share": "defaultCategories.rideShare",
  Parking: "defaultCategories.parking",
  Maintenance: "defaultCategories.maintenance",
  Rent: "defaultCategories.rent",
  Mortgage: "defaultCategories.mortgage",
  Utilities: "defaultCategories.utilities",
  Insurance: "defaultCategories.insurance",
  Repairs: "defaultCategories.repairs",
  Clothing: "defaultCategories.clothing",
  Electronics: "defaultCategories.electronics",
  "Home Goods": "defaultCategories.homeGoods",
  Gifts: "defaultCategories.gifts",
  Streaming: "defaultCategories.streaming",
  Movies: "defaultCategories.movies",
  Games: "defaultCategories.games",
  Events: "defaultCategories.events",
  Hobbies: "defaultCategories.hobbies",
  Doctor: "defaultCategories.doctor",
  Pharmacy: "defaultCategories.pharmacy",
  Gym: "defaultCategories.gym",
  Tuition: "defaultCategories.tuition",
  Books: "defaultCategories.books",
  Courses: "defaultCategories.courses",
  Supplies: "defaultCategories.supplies",
  Haircut: "defaultCategories.haircut",
  Subscriptions: "defaultCategories.subscriptions",
  Donations: "defaultCategories.donations",
  Pets: "defaultCategories.pets",
  "Main Job": "defaultCategories.mainJob",
  "Side Job": "defaultCategories.sideJob",
  Bonus: "defaultCategories.bonus",
  Projects: "defaultCategories.projects",
  Consulting: "defaultCategories.consulting",
  Dividends: "defaultCategories.dividends",
  Interest: "defaultCategories.interest",
  "Capital Gains": "defaultCategories.capitalGains",
  Refunds: "defaultCategories.refunds",
  "Gifts Received": "defaultCategories.giftsReceived",
  Cashback: "defaultCategories.cashback",
};

/**
 * Translate a category or subcategory name if it's a known default.
 * Falls back to the original name for user-created categories.
 */
export function translateCategoryName(name: string, t: (key: string) => string): string {
  const key = DEFAULT_NAME_KEYS[name];
  if (!key) return name;
  const translated = t(key);
  // If i18n returns the key itself (missing translation), fall back to English
  return translated === key ? name : translated;
}

type CategorySeed = {
  name: string;
  color: string;
  icon: string;
  isIncome: boolean;
  isExpense: boolean;
  subcategories: string[];
};

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  {
    name: "Food & Dining",
    color: "#EF4444",
    icon: "food",
    isIncome: true,
    isExpense: true,
    subcategories: ["Groceries", "Restaurants", "Coffee", "Fast Food", "Delivery"],
  },
  {
    name: "Transport",
    color: "#3B82F6",
    icon: "car",
    isIncome: true,
    isExpense: true,
    subcategories: ["Fuel", "Public Transit", "Ride Share", "Parking", "Maintenance"],
  },
  {
    name: "Housing",
    color: "#8B5CF6",
    icon: "home",
    isIncome: true,
    isExpense: true,
    subcategories: ["Rent", "Mortgage", "Utilities", "Insurance", "Repairs"],
  },
  {
    name: "Shopping",
    color: "#EC4899",
    icon: "shopping",
    isIncome: true,
    isExpense: true,
    subcategories: ["Clothing", "Electronics", "Home Goods", "Gifts"],
  },
  {
    name: "Entertainment",
    color: "#F59E0B",
    icon: "movie-open",
    isIncome: true,
    isExpense: true,
    subcategories: ["Streaming", "Movies", "Games", "Events", "Hobbies"],
  },
  {
    name: "Health",
    color: "#10B981",
    icon: "heart-pulse",
    isIncome: true,
    isExpense: true,
    subcategories: ["Doctor", "Pharmacy", "Gym", "Insurance"],
  },
  {
    name: "Education",
    color: "#6366F1",
    icon: "school",
    isIncome: true,
    isExpense: true,
    subcategories: ["Tuition", "Books", "Courses", "Supplies"],
  },
  {
    name: "Personal",
    color: "#14B8A6",
    icon: "account",
    isIncome: true,
    isExpense: true,
    subcategories: ["Haircut", "Subscriptions", "Donations", "Pets"],
  },
  {
    name: "Salary",
    color: "#22C55E",
    icon: "briefcase",
    isIncome: true,
    isExpense: true,
    subcategories: ["Main Job", "Side Job", "Bonus"],
  },
  {
    name: "Freelance",
    color: "#06B6D4",
    icon: "laptop",
    isIncome: true,
    isExpense: true,
    subcategories: ["Projects", "Consulting"],
  },
  {
    name: "Investments",
    color: "#A855F7",
    icon: "chart-line",
    isIncome: true,
    isExpense: true,
    subcategories: ["Dividends", "Interest", "Capital Gains"],
  },
  {
    name: "Other Income",
    color: "#78716C",
    icon: "cash-plus",
    isIncome: true,
    isExpense: true,
    subcategories: ["Refunds", "Gifts Received", "Cashback"],
  },
];
