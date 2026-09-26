import {
  Book,
  Bus,
  Car,
  Clapperboard,
  Coffee,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Package,
  PawPrint,
  PiggyBank,
  Plane,
  Repeat,
  ShoppingBag,
  Smartphone,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

const ICONS: Record<string, LucideIcon> = {
  home: House,
  utensils: UtensilsCrossed,
  bus: Bus,
  smartphone: Smartphone,
  graduation: GraduationCap,
  shopping: ShoppingBag,
  film: Clapperboard,
  health: HeartPulse,
  repeat: Repeat,
  package: Package,
  piggy: PiggyBank,
  gift: Gift,
  plane: Plane,
  car: Car,
  coffee: Coffee,
  book: Book,
  dumbbell: Dumbbell,
  paw: PawPrint,
  zap: Zap,
  tag: Tag,
  wallet: Wallet,
  trending: TrendingUp,
};

export function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? Tag;
}

/** Coloured, depth-shaded icon tile used wherever a category appears. */
export function CategoryBadge({ icon, color, size = 36 }: { icon: string; color: string; size?: number }) {
  const Icon = iconFor(icon);
  return (
    <span className="cat-badge" style={{ "--cat": color, width: size, height: size } as CSSProperties} aria-hidden="true">
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}
