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
import { registerSynologyTools } from "./tools/synology.js";

// Productivity / knowledge
import { registerConfluenceTools } from "./tools/confluence.js";
import { registerGoogleTools } from "./tools/google.js";

// ITSM
import { registerFreshServiceTools } from "./tools/freshservice.js";

// Specialised
import { registerPrinterLogicTools } from "./tools/printerlogic.js";
import { registerHibpTools } from "./tools/hibp.js";
import { registerCloudflareTools } from "./tools/cloudflare.js";
import { registerN8nTools } from "./tools/n8n.js";

// Staging / collector
import { registerStagingTools } from "./tools/staging.js";
import { registerPowerShellTools } from "./tools/powershell.js";
import { registerDbQueryTools } from "./tools/db-query.js";

// Load credentials from Bitwarden. Throws if BW_SESSION is not set or vault fetch fails.
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

const graphUserId = process.env["GRAPH_USER_ID"] || undefined;
if (!graphUserId) {
  console.error(
    "[svh-opsman] WARNING: GRAPH_USER_ID not set — mail and calendar tools will return errors"
  );
}

const googleUserId = process.env["GOOGLE_USER_EMAIL"] || undefined;

const services = {
  graph: checkEnv("GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET"),
  mde: checkEnv("MDE_TENANT_ID", "MDE_CLIENT_ID", "MDE_CLIENT_SECRET"),
  azure: checkEnv("AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_SUBSCRIPTION_ID"),
  unifiCloud: checkEnv("UNIFI_API_KEY"),
  unifiController: checkEnv("UNIFI_SVH_URL", "UNIFI_SVH_KEY"),
  ninjaone: checkEnv("NINJA_CLIENT_ID", "NINJA_CLIENT_SECRET"),
  wazuh: checkEnv("WAZUH_URL") && (!!process.env["WAZUH_TOKEN"] || checkEnv("WAZUH_USERNAME", "WAZUH_PASSWORD")),
  confluence: checkEnv("CONFLUENCE_DOMAIN", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN"),
  printerlogic: checkEnv("PRINTERLOGIC_URL", "PRINTERLOGIC_API_TOKEN"),
  google: checkEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"),
  freshservice: checkEnv("FRESHSERVICE_DOMAIN", "FRESHSERVICE_API_KEY"),
  synology: checkEnv("SYNOLOGY_HOST", "SYNOLOGY_USER", "SYNOLOGY_PASSWORD"),
  hibp: checkEnv("HIBP_API_KEY"),
  cloudflare: checkEnv("CLOUDFLARE_API_TOKEN"),
  n8n: checkEnv("N8N_URL", "N8N_API_KEY"),
  staging: true as boolean,
  powershell: true as boolean,
  db_query: true as boolean,
};

// Microsoft Graph — covers all Graph-backed services
registerPlannerTools(server, services.graph);
registerMsTodoTools(server, services.graph);
registerEntraAdminTools(server, services.graph);
registerOneDriveTools(server, services.graph);
registerSharePointTools(server, services.graph);
registerTeamsTools(server, services.graph, graphUserId);
registerOutlookMailTools(server, services.graph, graphUserId);
registerOutlookCalendarTools(server, services.graph, graphUserId);
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
registerSynologyTools(server, services.synology);

// Productivity / knowledge
registerConfluenceTools(server, services.confluence);
registerGoogleTools(server, services.google, googleUserId);

// ITSM
registerFreshServiceTools(server, services.freshservice);

// Specialised
registerPrinterLogicTools(server, services.printerlogic);
registerHibpTools(server, services.hibp);
registerCloudflareTools(server, services.cloudflare);
registerN8nTools(server, services.n8n);
registerStagingTools(server, services.staging);
registerPowerShellTools(server, services.powershell);
registerDbQueryTools(server, services.db_query);

// Admin — reload BW credentials without restarting the server
server.tool(
  "refresh_secrets",
  "Reload all credentials from Bitwarden without restarting the server. Call this after updating the SVH OpsMan Bitwarden item — new API keys and URLs will be picked up immediately.",
  {},
  async () => {
    try {
      await loadBitwardenSecrets();
      return { content: [{ type: "text" as const, text: "Secrets reloaded from Bitwarden successfully." }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Failed to reload secrets: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

const enabledCount = Object.values(services).filter(Boolean).length;
console.error(
  `[svh-opsman] Starting — ${enabledCount}/${Object.keys(services).length} service groups configured`
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[svh-opsman] Ready — listening on stdio");