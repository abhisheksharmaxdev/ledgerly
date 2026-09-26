import { useId } from "react";
import { cn } from "../../utils/cn";

/** Accessible single-choice toggle built on native radio inputs (arrow keys work for free). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  size?: "sm" | "md";
}) {
  const name = useId();
  return (
    <div className={cn("segmented", size === "sm" && "segmented--sm")} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className={cn("segmented__opt", value === o.value && "is-active")}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
