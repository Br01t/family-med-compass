import { CheckCircle2, Info, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeedbackVariant = "success" | "error" | "info";

const variantStyles: Record<FeedbackVariant, string> = {
  success: "bg-emerald-500 text-emerald-50",
  error: "bg-destructive text-destructive-foreground",
  info: "bg-primary text-primary-foreground",
};

const variantIcon = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  variant?: FeedbackVariant;
  actionLabel?: string;
  onAction?: () => void;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = "info",
  actionLabel = "Chiudi",
  onAction,
}: FeedbackDialogProps) {
  const Icon = variantIcon[variant];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full shadow-sm">
          <div
            className={cn(
              "grid h-14 w-14 place-items-center rounded-full shadow-lg",
              variantStyles[variant],
            )}
          >
            <Icon className="h-7 w-7" />
          </div>
        </div>

        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-semibold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-6 justify-center gap-2">
          {onAction ? (
            <Button
              className="w-full"
              onClick={() => {
                onAction();
                onOpenChange(false);
              }}
            >
              {actionLabel}
            </Button>
          ) : (
            <DialogClose asChild>
              <Button className="w-full" variant="secondary">
                {actionLabel}
              </Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
