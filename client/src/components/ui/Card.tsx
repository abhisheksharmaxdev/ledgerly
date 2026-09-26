import type { HTMLAttributes, ReactNode } from "react";
import { useTilt } from "../../hooks";
import { cn } from "../../utils/cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  tilt?: boolean;
  as?: "section" | "article" | "div";
  variant?: "glass" | "raised" | "hero";
}

/** Glass panel with layered depth. `tilt` adds the pointer-follow 3D effect. */
export function Card({ tilt = false, as: Tag = "section", variant = "glass", className, children, ...rest }: CardProps) {
  const ref = useTilt<HTMLElement>(tilt ? 4 : 0);
  return (
    <Tag ref={tilt ? (ref as never) : undefined} className={cn("card", `card--${variant}`, tilt && "card--tilt", className)} {...rest}>
      <div className="card__inner">{children}</div>
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <header className="card-header">
      <div className="card-header__text">
        <h2 className="card-title" id={id}>
          {title}
        </h2>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="card-header__action">{action}</div>}
    </header>
  );
}
