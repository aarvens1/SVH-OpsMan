import { writeStagingFile } from "../staging.js";
import { getConfig } from "../config.js";
import type { Job } from "./base.js";

// TODO (Phase 3): implement UniFi collection
// Endpoints needed:
//   GET https://api.ui.com/ea/sites                → site list
//   GET https://api.ui.com/ea/devices?siteId=...   → device status per site
//   GET https://api.ui.com/ea/alerts               → active alerts
export const unifiJob: Job = {
  name: "unifi",

  async run(stagingDir: string) {
    if (!getConfig().unifi.apiKey) {
      console.warn("[unifi] API key not configured — skipping");
      return { files: [], records: 0 };
    }
    // Placeholder until Phase 3
    writeStagingFile(stagingDir, "unifi-alerts.json", { status: "not_implemented", alerts: [] });
    return { files: ["unifi-alerts.json"], records: 0 };
  },
};
