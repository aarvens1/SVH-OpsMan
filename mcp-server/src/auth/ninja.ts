import axios from "axios";

interface TokenCacheEntry {
  access_token: string;
  expires_at: number;
}

let cached: TokenCacheEntry | null = null;

export async function getNinjaToken(): Promise<string> {
  if (cached && Date.now() < cached.expires_at - 60_000) {
    return cached.access_token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env["NINJA_CLIENT_ID"] ?? "",
    client_secret: process.env["NINJA_CLIENT_SECRET"] ?? "",
    scope: "monitoring",
  });

  const res = await axios.post<{ access_token: string; expires_in: number }>(
    "https://app.ninjarmm.com/oauth/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cached = {
    access_token: res.data.access_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
  };
  return cached.access_token;
}
