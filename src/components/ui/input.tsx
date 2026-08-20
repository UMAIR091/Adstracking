import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "field flex h-9 w-full py-2",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
