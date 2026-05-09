import axios from "axios";

interface TokenCacheEntry {
  access_token: string;
  expires_at: number;
}

const cache = new Map<string, TokenCacheEntry>();

const ARM_SCOPE = "https://management.azure.com/.default";

export async function getArmToken(): Promise<string> {
  const entry = cache.get(ARM_SCOPE);
  if (entry && Date.now() < entry.expires_at - 60_000) {
    return entry.access_token;
  }

  const tenantId = process.env["AZURE_TENANT_ID"];
  const clientId = process.env["AZURE_CLIENT_ID"];
  const clientSecret = process.env["AZURE_CLIENT_SECRET"];

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId ?? "",
    client_secret: clientSecret ?? "",
    scope: ARM_SCOPE,
  });

  const res = await axios.post<{ access_token: string; expires_in: number }>(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const newEntry: TokenCacheEntry = {
    access_token: res.data.access_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
  };
  cache.set(ARM_SCOPE, newEntry);
  return newEntry.access_token;
}
