import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadBitwardenSecrets } from "./secrets.js";
import { registerPlannerTools } from "./tools/planner.js";
import { registerUnifiCloudTools } from "./tools/unifi-cloud.js";
import { registerUnifiNetworkTools } from "./tools/unifi-network.js";
import { registerNinjaOneTools } from "./tools/ninjaone.js";
import { registerDefenderMdeTools } from "./tools/defender-mde.js";
import { registerEntraAdminTools } from "./tools/entra-admin.js";
import { registerOneDriveTools } from "./tools/onedrive.js";
import { registerTeamsTools } from "./tools/teams.js";
import { registerConfluenceTools } from "./tools/confluence.js";
import { registerTodoistTools } from "./tools/todoist.js";
import { registerIntuneTools } from "./tools/intune.js";
import { registerMsAdminTools } from "./tools/ms-admin.js";
import { registerBraveSearchTools } from "./tools/brave-search.js";

function checkEnv(...vars: string[]): boolean {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      `[it-ops-mcp] WARNING: Missing env vars: ${missing.join(", ")} — related tools will return errors`
    );
    return false;
  }
  return true;
}

// Load secrets from Bitwarden Secrets Manager before checking env vars.
// In Docker, BWS_ACCESS_TOKEN is the only env var that needs to be passed in.
// Locally with a .env file, individual vars can still be set directly.
await loadBitwardenSecrets();

const server = new McpServer({ name: "it-ops-server", version: "1.0.0" });

const services = {
  graph: checkEnv("GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET"),
  unifiCloud: checkEnv("UNIFI_API_KEY"),
  unifiController: checkEnv("UNIFI_CONTROLLER_URL", "UNIFI_USERNAME", "UNIFI_PASSWORD"),
  ninjaone: checkEnv("NINJA_CLIENT_ID", "NINJA_CLIENT_SECRET"),
  mde: checkEnv("MDE_TENANT_ID", "MDE_CLIENT_ID", "MDE_CLIENT_SECRET"),
  confluence: checkEnv("CONFLUENCE_DOMAIN", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN"),
  todoist: checkEnv("TODOIST_API_TOKEN"),
  braveSearch: checkEnv("BRAVE_SEARCH_API_KEY"),
};

registerPlannerTools(server, services.graph);
registerUnifiCloudTools(server, services.unifiCloud);
registerUnifiNetworkTools(server, services.unifiController);
registerNinjaOneTools(server, services.ninjaone);
registerDefenderMdeTools(server, services.mde);
registerEntraAdminTools(server, services.graph);
registerOneDriveTools(server, services.graph);
registerTeamsTools(server, services.graph);
registerConfluenceTools(server, services.confluence);
registerTodoistTools(server, services.todoist);
registerIntuneTools(server, services.graph);
registerMsAdminTools(server, services.graph);
registerBraveSearchTools(server, services.braveSearch);

const enabledCount = Object.values(services).filter(Boolean).length;
console.error(
  `[it-ops-mcp] Server starting — ${enabledCount}/${Object.keys(services).length} services configured`
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[it-ops-mcp] Ready — listening on stdio");
