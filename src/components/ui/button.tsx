import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Button hierarchy is deliberate and narrow: exactly one filled action per
// view, outline for the supporting action, ghost for tertiary. The ring offset
// uses the surface colour so the focus halo reads correctly on cards and on the
// page background.
//
// Colours, heights, radius and shadows are CSS variables (globals.css): inside
// the signed-in app the filled action is ink with a teal hover and everything
// is flat, while the public pages that reuse this keep the indigo look they
// had. Variables rather than an `app:` variant, so a caller's own `h-8` or
// `border-danger-200` still wins.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-all duration-150 active:translate-y-px focus-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Press feedback comes from the shared `active:translate-y-px`; a third
        // fill stop would just be another token to keep accessible.
        default: "bg-primary text-primary-fg shadow-btn hover:bg-primary-hover",
        outline:
          "border border-control-line bg-surface text-control-fg shadow-btn-outline hover:border-control-line-hover hover:bg-control-hover-bg hover:text-ink-900",
        secondary: "bg-ink-100 text-ink-800 hover:bg-ink-200",
        ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
        destructive: "bg-danger-solid text-white shadow-btn hover:bg-danger-solid-hover",
      },
      size: {
        default: "h-[var(--btn-h)] px-3.5 py-2",
        sm: "h-[var(--btn-h-sm)] px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        icon: "h-[var(--btn-h)] w-[var(--btn-h)]",
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
