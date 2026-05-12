import { execSync } from "child_process";

// Store all MCP credentials as custom fields on a single Bitwarden vault item.
// Item name must match VAULT_ITEM exactly — custom field names must match env var keys.
const VAULT_ITEM = "SVH OpsMan";

export async function loadBitwardenSecrets(): Promise<void> {
  const session = process.env["BW_SESSION"];
  if (!session) {
    // No session key — fall through to env vars / .env file
    console.error("[svh-opsman] BW_SESSION not set — using environment variables directly");
    return;
  }

  try {
    try {
      execSync(`bw sync --session "${session}"`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15_000,
      });
    } catch {
      console.error("[svh-opsman] bw sync failed — using cached vault data");
    }

    const raw = execSync(`bw get item "${VAULT_ITEM}" --session "${session}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10_000,
    });

    const item = JSON.parse(raw) as { fields?: { name: string; value: string }[] };
    const fields = item.fields ?? [];

    let loaded = 0;
    for (const field of fields) {
      if (field.name && field.value !== undefined) {
        process.env[field.name] = field.value;
        loaded++;
      }
    }

    console.error(`[svh-opsman] Loaded ${loaded} credential(s) from Bitwarden vault`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[svh-opsman] Bitwarden vault fetch failed: ${msg}\n  → Falling back to environment variables`
    );
  }
}
