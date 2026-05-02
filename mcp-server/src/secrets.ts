import { BitwardenClient, ClientSettings, DeviceType, LogLevel } from "@bitwarden/sdk-napi";

interface SecretSummary {
  id: string;
  key: string;
}

interface SecretFull {
  id: string;
  key: string;
  value: string;
  note: string;
}

export async function loadBitwardenSecrets(): Promise<void> {
  const accessToken = process.env["BWS_ACCESS_TOKEN"];
  if (!accessToken) {
    console.error(
      "[it-ops-mcp] BWS_ACCESS_TOKEN not set — skipping Bitwarden Secrets Manager"
    );
    return;
  }

  const settings: ClientSettings = {
    apiUrl: process.env["BWS_API_URL"] ?? "https://api.bitwarden.com",
    identityUrl:
      process.env["BWS_IDENTITY_URL"] ?? "https://identity.bitwarden.com",
    userAgent: "it-ops-mcp-server/1.0.0",
    deviceType: DeviceType.SDK,
  };

  const client = new BitwardenClient(settings, LogLevel.Error);

  try {
    const authResult = await client.auth().loginAccessToken(accessToken);
    const orgId =
      (authResult as unknown as Record<string, string>)["organizationId"] ??
      process.env["BWS_ORG_ID"];

    if (!orgId) {
      console.error(
        "[it-ops-mcp] Could not determine organization ID — set BWS_ORG_ID if needed"
      );
      return;
    }

    const listResult = await client.secrets().list(orgId);
    const summaries: SecretSummary[] =
      (listResult as unknown as { data: { data: SecretSummary[] } }).data
        ?.data ?? [];

    let loaded = 0;
    for (const summary of summaries) {
      try {
        const fullResult = await client.secrets().get(summary.id);
        const secret: SecretFull = (
          fullResult as unknown as { data: SecretFull }
        ).data;
        if (secret?.key && secret.value !== undefined) {
          process.env[secret.key] = secret.value;
          loaded++;
        }
      } catch (e) {
        console.error(
          `[it-ops-mcp] Failed to fetch secret ${summary.id} (${summary.key}):`,
          e
        );
      }
    }

    console.error(
      `[it-ops-mcp] Loaded ${loaded} secret(s) from Bitwarden Secrets Manager`
    );
  } catch (err) {
    console.error("[it-ops-mcp] Bitwarden Secrets Manager error:", err);
    // Don't throw — fall back to whatever env vars are already set
  }
}
