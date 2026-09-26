/**
 * Domain constants shared by the client and the server.
 * Categories live in the database; DEFAULT_CATEGORIES only seeds a fresh install.
 */

export const PAYMENT_METHODS = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "debit_card", label: "Debit Card" },
  { value: "credit_card", label: "Credit Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((p) => p.value) as [PaymentMethod, ...PaymentMethod[]];

export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "Unspecified";
  return PAYMENT_METHODS.find((p) => p.value === value)?.label ?? "Other";
}

/** "expense" = consumption spending, "savings" = money set aside (never counted as spending). */
export const CATEGORY_KINDS = ["expense", "savings"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface CategorySeed {
  slug: string;
  name: string;
  color: string;
  icon: string;
  kind: CategoryKind;
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { slug: "rent", name: "Rent / Hostel", color: "#818cf8", icon: "home", kind: "expense" },
  { slug: "food", name: "Food", color: "#fb923c", icon: "utensils", kind: "expense" },
  { slug: "travel", name: "Travel / Transport", color: "#38bdf8", icon: "bus", kind: "expense" },
  { slug: "mobile", name: "Mobile + Internet", color: "#c084fc", icon: "smartphone", kind: "expense" },
  { slug: "education", name: "College / Education", color: "#4ade80", icon: "graduation", kind: "expense" },
  { slug: "shopping", name: "Shopping", color: "#f472b6", icon: "shopping", kind: "expense" },
  { slug: "entertainment", name: "Entertainment", color: "#fbbf24", icon: "film", kind: "expense" },
  { slug: "health", name: "Health / Medicine", color: "#2dd4bf", icon: "health", kind: "expense" },
  { slug: "subscriptions", name: "Subscriptions", color: "#e879f9", icon: "repeat", kind: "expense" },
  { slug: "other", name: "Other / Miscellaneous", color: "#94a3b8", icon: "package", kind: "expense" },
  { slug: "savings", name: "Savings / Investments", color: "#a3e635", icon: "piggy", kind: "savings" },
];

/** Icon keys a category may use (mapped to icon components on the client). */
export const CATEGORY_ICONS = [
  "home", "utensils", "bus", "smartphone", "graduation", "shopping", "film", "health",
  "repeat", "package", "piggy", "gift", "plane", "car", "coffee", "book", "dumbbell",
  "paw", "zap", "tag", "wallet", "trending",
] as const;

export const CATEGORY_COLORS = [
  "#818cf8", "#fb923c", "#38bdf8", "#c084fc", "#4ade80", "#f472b6", "#fbbf24",
  "#2dd4bf", "#e879f9", "#94a3b8", "#a3e635", "#f87171", "#60a5fa", "#facc15",
] as const;

export const CURRENCIES = [
  { code: "INR", symbol: "₹", locale: "en-IN", label: "Indian Rupee (₹)" },
  { code: "USD", symbol: "$", locale: "en-US", label: "US Dollar ($)" },
  { code: "EUR", symbol: "€", locale: "en-IE", label: "Euro (€)" },
  { code: "GBP", symbol: "£", locale: "en-GB", label: "British Pound (£)" },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]];

/** Budget status threshold: at or above this fraction of budget a category is "approaching limit". */
export const BUDGET_WARNING_RATIO = 0.8;

/** Largest single amount accepted: ₹100 crore, stored as 1e10 paise (well inside JS safe integers). */
export const MAX_AMOUNT_MINOR = 10_000_000_000;

export interface AppSettings {
  currency: CurrencyCode;
  theme: "dark" | "light" | "system";
  defaultMonth: "current" | "last_viewed";
  animations: "full" | "reduced";
  background3d: "auto" | "on" | "off";
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: "INR",
  theme: "dark",
  defaultMonth: "current",
  animations: "full",
  background3d: "auto",
};
