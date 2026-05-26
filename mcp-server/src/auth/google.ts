import axios from "axios";

interface TokenCache {
  access_token: string;
  expires_at: number;
}

let cached: TokenCache | null = null;

export async function getGoogleToken(): Promise<string> {
  if (cached && Date.now() < cached.expires_at - 60_000) return cached.access_token;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env["GOOGLE_CLIENT_ID"] ?? "",
    client_secret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
    refresh_token: process.env["GOOGLE_REFRESH_TOKEN"] ?? "",
  });

  const res = await axios.post<{ access_token: string; expires_in: number }>(
    "https://oauth2.googleapis.com/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cached = {
    access_token: res.data.access_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
  };
  return cached.access_token;
}
