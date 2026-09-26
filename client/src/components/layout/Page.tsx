import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { cn } from "../../utils/cn";

export function Page({ title, subtitle, actions, children, className }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  useEffect(() => {
    document.title = `${title} · Ledgerly`;
  }, [title]);
  return (
    <motion.div
      className={cn("page", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
      {children}
    </motion.div>
  );
}

/** Staggered entrance for grid cells. */
export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.04 * index, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
