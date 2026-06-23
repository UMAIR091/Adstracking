"use client";

import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SoonButton({ children, message, ...rest }: ButtonProps & { message?: string }) {
  return (
    <Button onClick={() => toast("Coming soon", { description: message ?? "This launches in an upcoming release." })} {...rest}>
      {children}
    </Button>
  );
}
