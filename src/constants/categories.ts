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
