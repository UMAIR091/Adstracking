import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The project's own radius and shadow names (tailwind.config: the token-driven
// shapes the shared primitives use). Without them tailwind-merge doesn't know
// `rounded-control` and `rounded-full` conflict, so a caller's override would
// sit beside the default and lose on stylesheet order.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ["control", "card", "dialog"] }],
      shadow: [{ shadow: ["btn", "btn-outline", "card", "field"] }],
    },
  },
});

// shadcn/ui class-merge helper.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
