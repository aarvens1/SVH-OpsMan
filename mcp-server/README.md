# SVH OpsMan — MCP Server

TypeScript MCP server exposing SVH's IT integrations to Claude. Runs in WSL via Node.js — no Docker.

For the full list of integrated services, available tools, and credential reference, see the [root README](../README.md).

---

## Quick start

```bash
npm install
cp .env.example .env   # fill in credentials for the services you use
npm run dev            # run from source with tsx (development)
# or
npm run build && npm start   # run compiled output (production)
```

The server prints which service groups loaded on startup:

```
[svh-opsman] Starting — 7/12 service groups configured
[svh-opsman] Ready — listening on stdio
```

Services with missing credentials log a warning and their tools return a clear error message — they won't crash the server.

---

## Dev commands

```bash
npm run dev        # run src/index.ts via tsx (hot-reload friendly, restart manually)
npm run build      # compile TypeScript → dist/
npm start          # run dist/index.js
npm run typecheck  # type-check without building
```

To browse all registered tools interactively:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

---

## Adding a new tool

1. Create `src/tools/your-service.ts` — export `registerYourServiceTools(server, enabled)`.
2. Follow the existing pattern: `disabled()` / `ok()` / `err()` helpers, `server.registerTool(name, {description, inputSchema}, handler)`.
3. If the service needs a new auth client, add it to `src/auth/` and a client factory to `src/utils/http.ts`.
4. Add the service check and registration call to `src/index.ts`.
5. Add env var examples to `.env.example`.

See `CLAUDE.md` in the repo root for the full process including README and skill updates.

---

## Common issues

**Service shows as not configured / tools return errors**
Check that the env var names in `.env` match exactly (they're case-sensitive). Run `npm run dev` and look at the startup warnings.

**Planner update fails with 412 Precondition Failed**
Re-fetch the task before updating — Planner requires the current ETag. Ask Claude to retry from a fresh fetch.

**UniFi controller session expires**
Sessions refresh automatically but last ~1 hour. If you see repeated auth errors, check that `UNIFI_CONTROLLER_URL`, `UNIFI_USERNAME`, and `UNIFI_PASSWORD` are correct and the controller is reachable from WSL.

**Wazuh TLS errors**
The Wazuh client skips certificate verification by default (on-prem installations use self-signed certs). If you're seeing connection refused, check that `WAZUH_URL` uses `https://` and the port (default 55000) is reachable.
