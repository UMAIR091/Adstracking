"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getIntegrationName } from "@/lib/integrations/names";

// Surfaces OAuth connect results delivered via query params (?connected=<type>
// on success, ?connect_error=<message> on failure) as toasts, then strips the
// params so refresh/back doesn't re-fire. Mounted on the pages the OAuth
// callback redirects to.
export function ConnectStatusToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const connected = searchParams.get("connected");
  const error = searchParams.get("connect_error");

  useEffect(() => {
    if (!connected && !error) return;
    if (connected) toast.success(`${getIntegrationName(connected)} connected`);
    if (error) toast.error(`Couldn't connect: ${error}`);

    const rest = new URLSearchParams(searchParams);
    rest.delete("connected");
    rest.delete("connect_error");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, error]);

  return null;
}
