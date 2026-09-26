/**
 * Zod schemas shared by the API (authoritative validation) and the client (instant feedback).
 * All money fields are integer minor units (paise).
 */
import { z } from "zod";
import {
  CATEGORY_ICONS,
  CATEGORY_KINDS,
  CURRENCY_CODES,
  MAX_AMOUNT_MINOR,
  PAYMENT_METHOD_VALUES,
} from "./constants";
import { isValidIsoDate, isValidMonthKey } from "./dates";

export const minorAmount = z
  .number({ error: "Amount must be a number" })
  .int("Amount must be a whole number of paise")
  .min(0, "Amount cannot be negative")
  .max(MAX_AMOUNT_MINOR, "Amount is too large");

export const positiveMinorAmount = minorAmount.refine((v) => v > 0, "Amount must be greater than 0");

export const isoDate = z
  .string({ error: "Date is required" })
  .refine(isValidIsoDate, "Enter a valid date (YYYY-MM-DD)");

export const monthKey = z.string().refine(isValidMonthKey, "Month must look like YYYY-MM");

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Keep it under ${max} characters`)
    .nullish()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : null;
    });

export const paymentMethodSchema = z.enum(PAYMENT_METHOD_VALUES, { error: "Choose a valid payment method" });

export const expenseInputSchema = z.object({
  amountMinor: positiveMinorAmount,
  categoryId: z.number({ error: "Choose a category" }).int().positive("Choose a category"),
  date: isoDate,
  description: optionalText(200),
  paymentMethod: paymentMethodSchema.nullish().transform((v) => v ?? null),
});
export type ExpenseInput = z.input<typeof expenseInputSchema>;

export const planInputSchema = z
  .object({
    incomeMinor: minorAmount,
    budgets: z
      .array(z.object({ categoryId: z.number().int().positive(), amountMinor: minorAmount }))
      .max(200),
  })
  .refine((p) => new Set(p.budgets.map((b) => b.categoryId)).size === p.budgets.length, {
    message: "Each category can only appear once",
    path: ["budgets"],
  });
export type PlanInput = z.input<typeof planInputSchema>;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #818cf8");

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters"),
  color: hexColor,
  icon: z.enum(CATEGORY_ICONS),
  kind: z.enum(CATEGORY_KINDS).default("expense"),
});

export const categoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(40),
    color: hexColor,
    icon: z.enum(CATEGORY_ICONS),
    archived: z.boolean(),
  })
  .partial();

export const settingsSchema = z
  .object({
    currency: z.enum(CURRENCY_CODES),
    theme: z.enum(["dark", "light", "system"]),
    defaultMonth: z.enum(["current", "last_viewed"]),
    animations: z.enum(["full", "reduced"]),
    background3d: z.enum(["auto", "on", "off"]),
  })
  .partial();

const intList = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .transform((s) => s.split(",").map(Number));

export const expenseQuerySchema = z.object({
  month: monthKey.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  categoryIds: intList.optional(),
  paymentMethod: z.union([paymentMethodSchema, z.literal("none")]).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["date", "amount"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type ExpenseQuery = z.output<typeof expenseQuerySchema>;

export const emailSchema = z
  .string({ error: "Enter your email" })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email")
  .max(254, "Email is too long")
  .pipe(z.email({ error: "Enter a valid email address" }));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Enter your password" }).min(1, "Enter your password").max(200),
});

export const PASSWORD_MIN = 10;

export const signupSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Choose a password" })
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
    .max(200, "Password is too long"),
});

/** Converts Zod issues into a { field: message } map (first message per field wins). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
