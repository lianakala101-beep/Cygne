// APNS (Apple Push Notification Service) sender for Deno edge functions.
//
// No external dependencies — uses Web Crypto for ES256 JWT signing and
// fetch for HTTP/2 delivery. Apple's provider auth model:
//   1. Sign an ES256 JWT with an APNS auth key (.p8 PKCS#8) — separate
//      key from the App Store Connect API key. Created at
//      developer.apple.com → Certificates, IDs & Profiles → Keys with
//      "Apple Push Notifications service (APNs)" enabled.
//   2. POST to https://api.push.apple.com/3/device/<token> with the JWT
//      in Authorization and the app's bundle id in apns-topic.
//
// The JWT is good for up to 1 hour; we mint a fresh one per invocation
// since the edge function runs daily and doesn't persist state.
//
// Environment variables (set via `supabase secrets set …`):
//   APNS_KEY_ID       — 10-char Key ID from the Apple key page
//   APNS_TEAM_ID      — 10-char Team ID (same as ASC's; RYA5L58WXG for
//                       this project)
//   APNS_BUNDLE_ID    — apns-topic; com.cygne.app
//   APNS_KEY_CONTENT  — full .p8 file contents (BEGIN PRIVATE KEY …
//                       END PRIVATE KEY), NOT base64-wrapped
//   APNS_ENV          — "production" (default) or "sandbox" for TestFlight
//                       builds signed with a development APS entitlement.
//                       Production APNs handles both TestFlight and App
//                       Store builds when the entitlement is
//                       aps-environment=production (which this project's
//                       App.entitlements sets), so leave unset for
//                       normal use.

const APNS_HOSTS = {
  production: "https://api.push.apple.com",
  sandbox:    "https://api.sandbox.push.apple.com",
} as const;

export interface ApnsPayload {
  aps: {
    alert: { title: string; body: string };
    sound?: string;
    "content-available"?: 1;
    "mutable-content"?: 1;
    badge?: number;
    "thread-id"?: string;
  };
  // Custom data — surfaces in Capacitor's pushNotificationActionPerformed
  // event under `notification.data`.
  [key: string]: unknown;
}

export interface ApnsResult {
  token: string;
  status: number;
  reason?: string;
}

function readEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Convert a WebCrypto ECDSA-P256 raw signature (r||s, 64 bytes) into
// the "JWS" format expected by ES256 JWTs (also raw r||s, so this is
// a no-op wrapper — kept named for clarity).
function toJwsSignature(raw: ArrayBuffer): Uint8Array {
  return new Uint8Array(raw);
}

// Parse a PEM-formatted PKCS#8 private key into a CryptoKey for ECDSA
// P-256 signing.
async function importP8(p8: string): Promise<CryptoKey> {
  const pemBody = p8
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// Mint a fresh ES256 JWT for the current APNS provider. Apple caches
// these on their side for up to 1 hour but requires iat within that
// window — we always use Date.now() so this is trivially satisfied.
async function makeJwt(keyId: string, teamId: string, p8: string): Promise<string> {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const enc = new TextEncoder();
  const headerB64  = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importP8(p8);
  const raw = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(toJwsSignature(raw))}`;
}

// Deliver a single push to one device token. Returns the HTTP status
// plus (on non-2xx) Apple's `reason` string so the caller can decide
// whether to purge the token or log-and-continue.
async function deliverOne(
  host: string,
  jwt: string,
  bundleId: string,
  token: string,
  payload: ApnsPayload,
): Promise<ApnsResult> {
  const res = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      "authorization":     `bearer ${jwt}`,
      "apns-topic":        bundleId,
      "apns-push-type":    "alert",
      "content-type":      "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    // 2xx responses are always empty per Apple's spec — drain the
    // body so the connection can be reused.
    await res.body?.cancel();
    return { token, status: res.status };
  }
  let reason: string | undefined;
  try {
    const body = await res.json() as { reason?: string };
    reason = body.reason;
  } catch {
    // Body wasn't JSON or was empty — status alone is the signal.
  }
  return { token, status: res.status, reason };
}

// Send one payload to a batch of tokens. All deliveries are fired in
// parallel; the caller gets back a per-token result array with statuses
// so it can act on 410 Gone (token unregistered — should be deleted
// from device_tokens).
export async function sendApnsBatch(
  tokens: string[],
  payload: ApnsPayload,
): Promise<ApnsResult[]> {
  if (tokens.length === 0) return [];
  const keyId    = readEnv("APNS_KEY_ID");
  const teamId   = readEnv("APNS_TEAM_ID");
  const bundleId = readEnv("APNS_BUNDLE_ID");
  const p8       = readEnv("APNS_KEY_CONTENT");
  const envName  = (Deno.env.get("APNS_ENV") ?? "production") as keyof typeof APNS_HOSTS;
  const host     = APNS_HOSTS[envName] ?? APNS_HOSTS.production;
  const jwt = await makeJwt(keyId, teamId, p8);
  return await Promise.all(
    tokens.map((t) => deliverOne(host, jwt, bundleId, t, payload)),
  );
}

// Convenience: tokens Apple has marked as unregistered. Caller should
// delete these from device_tokens so future runs don't retry them.
export function isDeadToken(result: ApnsResult): boolean {
  // 410 Gone with reason "Unregistered" is the standard signal. 400
  // "BadDeviceToken" also means we should stop trying.
  return result.status === 410
    || result.reason === "Unregistered"
    || result.reason === "BadDeviceToken";
}
