import { execSync } from "child_process";

// Store all MCP credentials as custom fields on a single Bitwarden vault item.
// Item name must match VAULT_ITEM exactly — custom field names must match env var keys.
const VAULT_ITEM = "SVH OpsMan";

export async function loadBitwardenSecrets(): Promise<void> {
  const session = process.env["BW_SESSION"];
  if (!session) {
    throw new Error("[svh-opsman] BW_SESSION is not set — run: export BW_SESSION=$(bw unlock --raw)");
  }

  try {
    execSync(`bw sync --session "${session}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15_000,
    });
  } catch {
    console.error("[svh-opsman] bw sync failed — using cached vault data");
  }

  let raw: string;
  try {
    raw = execSync(`bw get item "${VAULT_ITEM}" --session "${session}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10_000,
    });
  } catch (e) {
    throw new Error(
      "[svh-opsman] BW session is locked or expired — run: export BW_SESSION=$(bw unlock --raw), then restart Claude Code"
    );
  }

  if (!raw || !raw.trim()) {
    throw new Error(
      "[svh-opsman] BW returned empty response — vault may be locked. Run: export BW_SESSION=$(bw unlock --raw), then restart Claude Code"
    );
  }

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
}
