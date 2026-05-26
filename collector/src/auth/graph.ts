import axios from "axios";
import { getConfig } from "../config.js";

interface TokenCache {
  access_token: string;
  expires_at: number;
}

const cache = new Map<string, TokenCache>();

export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export async function getGraphToken(scope = GRAPH_SCOPE): Promise<string> {
  const entry = cache.get(scope);
  if (entry && Date.now() < entry.expires_at - 60_000) return entry.access_token;

  const { tenantId, clientId, clientSecret } = getConfig().graph;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const res = await axios.post<{ access_token: string; expires_in: number }>(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const entry2: TokenCache = {
    access_token: res.data.access_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
  };
  cache.set(scope, entry2);
  return entry2.access_token;
}
