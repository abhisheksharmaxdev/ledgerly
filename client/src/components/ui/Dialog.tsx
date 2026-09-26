import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  role?: "dialog" | "alertdialog";
  onOpenAutoFocus?: (e: Event) => void;
}

export function Dialog({ open, onOpenChange, title, description, children, size = "md", role = "dialog", onOpenAutoFocus }: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="dialog-overlay" />
        <RD.Content
          className={cn("dialog", `dialog--${size}`)}
          role={role}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <div className="dialog__head">
            <div>
              <RD.Title className="dialog__title">{title}</RD.Title>
              {description ? (
                <RD.Description className="dialog__desc">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RD.Description>
              )}
            </div>
            <RD.Close className="icon-btn" aria-label="Close">
              <X size={18} />
            </RD.Close>
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} size="sm" role="alertdialog">
      {children}
      <div className="dialog__actions">
        <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={cn("btn", tone === "danger" ? "btn--danger" : "btn--primary")}
          onClick={onConfirm}
          disabled={busy}
          autoFocus
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
