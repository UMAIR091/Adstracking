"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getIntegrationName } from "@/lib/integrations/names";
import { CONNECT_FLASH_COOKIE, decodeConnectFlash, describeConnectFlash } from "@/lib/integrations/connectFlash";

// Reads the callback's one-shot note (which account, signed in as whom) and
// clears it so it can't attach itself to a later toast.
function takeConnectFlash() {
  const prefix = `${CONNECT_FLASH_COOKIE}=`;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return null;
  document.cookie = `${CONNECT_FLASH_COOKIE}=; Max-Age=0; Path=/dashboard`;
  return decodeConnectFlash(raw);
}

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
    if (connected) {
      toast.success(`${getIntegrationName(connected)} connected`, {
        description: describeConnectFlash(takeConnectFlash()),
      });
    }
    if (error) toast.error(`Couldn't connect: ${error}`);

    const rest = new URLSearchParams(searchParams);
    rest.delete("connected");
    rest.delete("connect_error");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, error]);

  return null;
}
