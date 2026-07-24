// SSRF guard for tenant-supplied URLs (e.g. an ActiveCampaign API URL or a
// WooCommerce store URL). Before the server fetches such a URL, assertPublicUrl
// checks that it is http(s) and that its host does not resolve to a private,
// loopback, link-local (incl. the 169.254.169.254 cloud-metadata address),
// carrier-grade-NAT, or otherwise non-public address. Called at the fetch layer
// so every request is checked — this also blunts DNS-rebinding (a host that
// resolved to a public IP at connect time but flips to a private one later).
import dns from "node:dns/promises";
import dnsCb from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";

function ipv4ToInt(ip: string): number {
  const p = ip.split(".").map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function inRange(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function isPrivateIPv4(ip: string): boolean {
  return (
    inRange(ip, "0.0.0.0", 8) ||       // "this" network
    inRange(ip, "10.0.0.0", 8) ||      // private
    inRange(ip, "100.64.0.0", 10) ||   // carrier-grade NAT
    inRange(ip, "127.0.0.0", 8) ||     // loopback
    inRange(ip, "169.254.0.0", 16) ||  // link-local (incl. cloud metadata)
    inRange(ip, "172.16.0.0", 12) ||   // private
    inRange(ip, "192.0.0.0", 24) ||    // IETF protocol assignments
    inRange(ip, "192.0.2.0", 24) ||    // TEST-NET-1
    inRange(ip, "192.168.0.0", 16) ||  // private
    inRange(ip, "198.18.0.0", 15) ||   // benchmarking
    inRange(ip, "198.51.100.0", 24) || // TEST-NET-2
    inRange(ip, "203.0.113.0", 24) ||  // TEST-NET-3
    inRange(ip, "224.0.0.0", 4) ||     // multicast
    inRange(ip, "240.0.0.0", 4)        // reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (/^f[cd]/.test(lower)) return true;   // unique-local fc00::/7
  if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
  return false;
}

function isPrivateIP(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true; // not a parseable IP → treat as unsafe
}

const PRIVATE_MSG = "This URL points to a private or reserved address and can't be used.";

export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  const host = url.hostname;

  // Literal IP host — check directly, no DNS.
  if (net.isIP(host)) {
    if (isPrivateIP(host)) throw new Error(PRIVATE_MSG);
    return;
  }
  // Common internal hostname aliases, blocked before any DNS lookup.
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i.test(host)) {
    throw new Error(PRIVATE_MSG);
  }
  // Resolve and reject if ANY resolved address is private.
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("Could not resolve the host for this URL.");
  }
  if (!addrs.length || addrs.some((a) => isPrivateIP(a.address))) {
    throw new Error(PRIVATE_MSG);
  }
}

// ─────────────────────────────────────────────────────────────
// safeFetch — the fetch every tenant-supplied URL MUST go through.
//
// assertPublicUrl alone leaves two holes that a determined attacker uses:
//   1. Redirects: a public URL can 30x to http://169.254.169.254 and the
//      default fetch follows it without re-checking.
//   2. DNS rebinding: the host resolves public during the pre-flight check, then
//      flips to a private IP by the time the socket actually connects (TOCTOU).
//
// safeFetch closes both:
//   • redirects are handled manually — every hop is re-validated with
//     assertPublicUrl before it is followed (bounded by maxRedirects);
//   • a custom DNS `lookup` runs at ACTUAL connect time and rejects private
//     addresses there, so a rebind between check and connect is caught on the
//     socket. TLS still validates against the real hostname (we resolve, we
//     don't rewrite the URL to an IP), so certificates keep working.
// ─────────────────────────────────────────────────────────────

export type SafeFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRedirects?: number;
};

// Node lookup that rejects private/reserved IPs at connect time (closes DNS
// rebinding). Mirrors the addresses back in whatever shape the caller asked for.
function guardedLookup(
  hostname: string,
  options: dnsCb.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dnsCb.LookupAddress[], family?: number) => void
): void {
  dnsCb.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = (addresses as dnsCb.LookupAddress[]) ?? [];
    for (const a of list) {
      if (isPrivateIP(a.address)) return callback(new Error(PRIVATE_MSG), "", a.family);
    }
    const first = list[0];
    if (!first) return callback(new Error("Could not resolve the host for this URL."), "", 4);
    if (options.all) callback(null, list);
    else callback(null, first.address, first.family);
  });
}

type RawResponse = { status: number; statusText: string; headers: IncomingHttpHeaders; body: Buffer };

function requestOnce(urlStr: string, init: SafeFetchInit): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(
      u,
      { method: init.method ?? "GET", headers: init.headers, lookup: guardedLookup },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.setTimeout(init.timeoutMs ?? 10_000, () => req.destroy(new Error("The request timed out.")));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

// Convert Node headers into a fetch Headers object (arrays flattened; set-cookie
// dropped — irrelevant for server-to-server data fetches and safest not to echo).
function toHeaders(h: IncomingHttpHeaders): Headers {
  const out = new Headers();
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined || k.toLowerCase() === "set-cookie") continue;
    out.set(k, Array.isArray(v) ? v.join(", ") : v);
  }
  return out;
}

// SSRF-safe fetch. Returns a standard Response, so callers use res.ok / res.json
// / res.headers exactly as before. Throws PRIVATE_MSG if any hop resolves to a
// private address.
export async function safeFetch(rawUrl: string, init: SafeFetchInit = {}): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? 3;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current);
    const r = await requestOnce(current, init);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      current = new URL(r.headers.location, current).toString();
      continue; // re-validated at the top of the next iteration
    }
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: toHeaders(r.headers) });
  }
  throw new Error("Too many redirects.");
}
