import axios from "axios";

interface TokenCacheEntry {
  access_token: string;
  expires_at: number;
}

let cached: TokenCacheEntry | null = null;

export async function getMdeToken(): Promise<string> {
  if (cached && Date.now() < cached.expires_at - 60_000) {
    return cached.access_token;
  }

  const tenantId = process.env["MDE_TENANT_ID"];
  const clientId = process.env["MDE_CLIENT_ID"];
  const clientSecret = process.env["MDE_CLIENT_SECRET"];

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId ?? "",
    client_secret: clientSecret ?? "",
    scope: "https://api.securitycenter.microsoft.com/.default",
  });

  const res = await axios.post<{ access_token: string; expires_in: number }>(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cached = {
    access_token: res.data.access_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
  };
  return cached.access_token;
}
