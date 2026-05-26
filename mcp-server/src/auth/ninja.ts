import axios from "axios";

interface TokenCacheEntry {
  access_token: string;
  expires_at: number;
}

let cached: TokenCacheEntry | null = null;
let managementCached: TokenCacheEntry | null = null;

async function fetchNinjaToken(scope: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env["NINJA_CLIENT_ID"] ?? "",
    client_secret: process.env["NINJA_CLIENT_SECRET"] ?? "",
    scope,
  });
  const res = await axios.post<{ access_token: string; expires_in: number }>(
    "https://app.ninjarmm.com/oauth/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return res.data.access_token;
}

export async function getNinjaToken(): Promise<string> {
  if (cached && Date.now() < cached.expires_at - 60_000) return cached.access_token;
  const token = await fetchNinjaToken("monitoring");
  cached = { access_token: token, expires_at: Date.now() + 3600 * 1000 };
  return token;
}

export async function getNinjaManagementToken(): Promise<string> {
  if (managementCached && Date.now() < managementCached.expires_at - 60_000) {
    return managementCached.access_token;
  }
  const token = await fetchNinjaToken("monitoring management");
  managementCached = { access_token: token, expires_at: Date.now() + 3600 * 1000 };
  return token;
}
