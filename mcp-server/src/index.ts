import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerPlannerTools } from "./tools/planner.js";
import { registerUnifiCloudTools } from "./tools/unifi-cloud.js";
import { registerUnifiNetworkTools } from "./tools/unifi-network.js";
import { registerNinjaOneTools } from "./tools/ninjaone.js";

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

const server = new McpServer({ name: "it-ops-server", version: "1.0.0" });

const services = {
  graph: checkEnv("GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET"),
  unifiCloud: checkEnv("UNIFI_API_KEY"),
  unifiController: checkEnv("UNIFI_CONTROLLER_URL", "UNIFI_USERNAME", "UNIFI_PASSWORD"),
  ninjaone: checkEnv("NINJA_CLIENT_ID", "NINJA_CLIENT_SECRET"),
};

registerPlannerTools(server, services.graph);
registerUnifiCloudTools(server, services.unifiCloud);
registerUnifiNetworkTools(server, services.unifiController);
registerNinjaOneTools(server, services.ninjaone);

const enabledCount = Object.values(services).filter(Boolean).length;
console.error(
  `[it-ops-mcp] Server starting — ${enabledCount}/${Object.keys(services).length} services configured`
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[it-ops-mcp] Ready — listening on stdio");
