import { useCountUp, useMoney } from "../../hooks";
import { cn } from "../../utils/cn";

/** Currency amount that counts up/down smoothly when the underlying value changes. */
export function AnimatedMoney({ minor, className, signed }: { minor: number; className?: string; signed?: boolean }) {
  const { fmt } = useMoney();
  const shown = useCountUp(minor);
  return (
    <span className={cn("money", className)} aria-label={fmt(minor, { signed })}>
      <span aria-hidden="true">{fmt(shown, { signed })}</span>
    </span>
  );
}
