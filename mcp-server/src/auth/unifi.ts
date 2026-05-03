import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import https from "https";

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface TokenCacheEntry {
  token: string;
  expires_at: number;
}

let cached: TokenCacheEntry | null = null;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function login(): Promise<string> {
  const baseURL = process.env["UNIFI_CONTROLLER_URL"];
  const res = await axios.post<{ data?: { token?: string } }>(
    `${baseURL}/api/auth/login`,
    {
      username: process.env["UNIFI_USERNAME"],
      password: process.env["UNIFI_PASSWORD"],
    },
    { headers: { "Content-Type": "application/json" }, httpsAgent }
  );

  const token = res.data.data?.token ?? "";
  if (!token) throw new Error("UniFi controller login returned no token");
  return token;
}

async function getControllerToken(): Promise<string> {
  if (cached && Date.now() < cached.expires_at - 60_000) {
    return cached.token;
  }
  const token = await login();
  cached = { token, expires_at: Date.now() + 60 * 60 * 1000 };
  return token;
}

export function invalidateControllerToken(): void {
  cached = null;
}

export function createControllerClient(): AxiosInstance {
  const baseURL = process.env["UNIFI_CONTROLLER_URL"];
  const instance = axios.create({
    baseURL,
    timeout: 30_000,
    headers: { "Content-Type": "application/json" },
    httpsAgent,
  });

  instance.interceptors.request.use(async (config) => {
    const token = await getControllerToken();
    config.headers["Authorization"] = `Bearer ${token}`;
    return config;
  });

  instance.interceptors.response.use(undefined, async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const config = error.config as RetryableRequestConfig | undefined;
      if (!config || config._retry) return Promise.reject(error);
      config._retry = true;
      invalidateControllerToken();
      const token = await getControllerToken();
      config.headers["Authorization"] = `Bearer ${token}`;
      return instance.request(config);
    }
    return Promise.reject(error);
  });

  return instance;
}
