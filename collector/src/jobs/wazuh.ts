import { writeStagingFile } from "../staging.js";
import { getConfig } from "../config.js";
import type { Job } from "./base.js";

// TODO (Phase 3): implement Wazuh collection
// Endpoints needed:
//   GET /security/user/authenticate  → JWT
//   GET /alerts?limit=500&sort=-timestamp  → recent alerts
//   GET /overview/agents             → agent health summary
export const wazuhJob: Job = {
  name: "wazuh",

  async run(stagingDir: string) {
    if (!getConfig().wazuh.url || !getConfig().wazuh.username) {
      console.warn("[wazuh] credentials not configured — skipping");
      return { files: [], records: 0 };
    }
    // Placeholder until Phase 3
    writeStagingFile(stagingDir, "wazuh-alerts.json", { status: "not_implemented", alerts: [] });
    return { files: ["wazuh-alerts.json"], records: 0 };
  },
};
