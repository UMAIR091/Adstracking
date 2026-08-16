import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Button hierarchy is deliberate and narrow: exactly one filled accent action
// per view, outline for the supporting action, ghost for tertiary. The ring
// offset uses the surface colour so the focus halo reads correctly on cards and
// on the page background.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Press feedback comes from the shared `active:translate-y-px`; a third
        // fill stop would just be another token to keep accessible.
        default: "bg-brand-500 text-white shadow-sm hover:bg-brand-600",
        outline: "border border-ink-200 bg-surface text-ink-700 shadow-xs hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900",
        secondary: "bg-ink-100 text-ink-800 hover:bg-ink-200",
        ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
        destructive: "bg-danger-600 text-white shadow-sm hover:bg-danger-700",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
