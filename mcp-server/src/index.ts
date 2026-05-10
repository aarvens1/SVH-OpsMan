import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadBitwardenSecrets } from "./secrets.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Microsoft Graph integrations
import { registerPlannerTools } from "./tools/planner.js";
import { registerMsTodoTools } from "./tools/ms-todo.js";
import { registerEntraAdminTools } from "./tools/entra-admin.js";
import { registerOneDriveTools } from "./tools/onedrive.js";
import { registerSharePointTools } from "./tools/sharepoint.js";
import { registerTeamsTools } from "./tools/teams.js";
import { registerOutlookMailTools } from "./tools/outlook-mail.js";
import { registerOutlookCalendarTools } from "./tools/outlook-calendar.js";
import { registerExchangeAdminTools } from "./tools/exchange-admin.js";
import { registerIntuneTools } from "./tools/intune.js";
import { registerMsAdminTools } from "./tools/ms-admin.js";
import { registerDefenderMdeTools } from "./tools/defender-mde.js";

// Azure Resource Manager
import { registerAzureTools } from "./tools/azure.js";

// Infrastructure / network
import { registerUnifiCloudTools } from "./tools/unifi-cloud.js";
import { registerUnifiNetworkTools } from "./tools/unifi-network.js";
import { registerNinjaOneTools } from "./tools/ninjaone.js";
import { registerWazuhTools } from "./tools/wazuh.js";

// Productivity / knowledge
import { registerConfluenceTools } from "./tools/confluence.js";

// Specialised
import { registerPrinterLogicTools } from "./tools/printerlogic.js";

// Load credentials from Bitwarden before checking env vars.
// Falls back silently to env vars / .env file if BW_SESSION is not set.
await loadBitwardenSecrets();

function checkEnv(...vars: string[]): boolean {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      `[svh-opsman] WARNING: Missing env vars: ${missing.join(", ")} — related tools will return errors`
    );
    return false;
  }
  return true;
}

const server = new McpServer({ name: "svh-opsman", version: "2.0.0" });

const services = {
  graph: checkEnv("GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET"),
  mde: checkEnv("MDE_TENANT_ID", "MDE_CLIENT_ID", "MDE_CLIENT_SECRET"),
  azure: checkEnv("AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_SUBSCRIPTION_ID"),
  unifiCloud: checkEnv("UNIFI_API_KEY"),
  unifiController: checkEnv("UNIFI_CONTROLLER_URL", "UNIFI_USERNAME", "UNIFI_PASSWORD"),
  ninjaone: checkEnv("NINJA_CLIENT_ID", "NINJA_CLIENT_SECRET"),
  wazuh: checkEnv("WAZUH_URL", "WAZUH_USERNAME", "WAZUH_PASSWORD"),
  confluence: checkEnv("CONFLUENCE_DOMAIN", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN"),
  printerlogic: checkEnv("PRINTERLOGIC_URL", "PRINTERLOGIC_API_TOKEN"),
};

// Microsoft Graph — covers all Graph-backed services
registerPlannerTools(server, services.graph);
registerMsTodoTools(server, services.graph);
registerEntraAdminTools(server, services.graph);
registerOneDriveTools(server, services.graph);
registerSharePointTools(server, services.graph);
registerTeamsTools(server, services.graph);
registerOutlookMailTools(server, services.graph);
registerOutlookCalendarTools(server, services.graph);
registerExchangeAdminTools(server, services.graph);
registerIntuneTools(server, services.graph);
registerMsAdminTools(server, services.graph);
registerDefenderMdeTools(server, services.mde);

// Azure Resource Manager
registerAzureTools(server, services.azure);

// Infrastructure
registerUnifiCloudTools(server, services.unifiCloud);
registerUnifiNetworkTools(server, services.unifiController);
registerNinjaOneTools(server, services.ninjaone);
registerWazuhTools(server, services.wazuh);

// Productivity / knowledge
registerConfluenceTools(server, services.confluence);

// Specialised
registerPrinterLogicTools(server, services.printerlogic);

const enabledCount = Object.values(services).filter(Boolean).length;
console.error(
  `[svh-opsman] Starting — ${enabledCount}/${Object.keys(services).length} service groups configured`
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[svh-opsman] Ready — listening on stdio");
