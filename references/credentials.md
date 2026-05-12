# SVH OpsMan — Credential Reference

Where credentials live for each integrated service. Check both custom fields AND item notes — some credentials are stored in notes, not fields.

## Bitwarden item: "SVH OpsMan"

All of the following are stored as **custom fields** in the "SVH OpsMan" BW item. All were also written to `mcp-server/.env` as fallback on 2026-05-11.

| Env var | Service |
|---------|---------|
| GRAPH_TENANT_ID | Microsoft Graph |
| GRAPH_CLIENT_ID | Microsoft Graph |
| GRAPH_CLIENT_SECRET | Microsoft Graph |
| GRAPH_USER_ID | Microsoft Graph (Aaron's object ID) |
| MDE_TENANT_ID | Microsoft Defender for Endpoint |
| MDE_CLIENT_ID | Microsoft Defender for Endpoint |
| MDE_CLIENT_SECRET | Microsoft Defender for Endpoint |
| AZURE_TENANT_ID | Azure |
| AZURE_CLIENT_ID | Azure |
| AZURE_CLIENT_SECRET | Azure |
| AZURE_SUBSCRIPTION_ID | Azure |
| NINJA_CLIENT_ID | NinjaOne |
| NINJA_CLIENT_SECRET | NinjaOne |
| OBSIDIAN_API_KEY | Obsidian Local REST API |

## Not yet in BW or .env

These services will fail when BW is locked until credentials are added:

| Service | Status |
|---------|--------|
| WAZUH_URL / WAZUH_USERNAME / WAZUH_PASSWORD | Not found in any BW item |
| CONFLUENCE_* | Not found in any BW item |
| UNIFI_* | Not found in any BW item |
| PRINTERLOGIC_* | Not found in any BW item |

## Notes

- A separate "Ninja API Key" BW item (`d3271524...`) previously held old NinjaOne credentials in its notes — deleted by user.
- When searching BW for missing credentials, check both custom fields and item notes.
- `.env` is gitignored (`mcp-server/.gitignore`). Do not commit it.
