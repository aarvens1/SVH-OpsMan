import { z } from "zod";
import { getNinjaToken } from "../auth/ninja.js";
import { ninjaClient, formatError } from "../utils/http.js";
const DISABLED_MSG = "NinjaOne service not configured: set NINJA_CLIENT_ID and NINJA_CLIENT_SECRET";
function disabled() {
    return {
        isError: true,
        content: [{ type: "text", text: DISABLED_MSG }],
    };
}
function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(e) {
    return { isError: true, content: [{ type: "text", text: formatError(e) }] };
}
export function registerNinjaOneTools(server, enabled) {
    // ── Device discovery ───────────────────────────────────────────────────────
    server.registerTool("ninja_list_servers", {
        description: "List servers managed by NinjaOne, filtered to server OS types by default. " +
            "Returns node name, OS, IP, uptime, and online status.",
        inputSchema: z.object({
            os_filter: z
                .string()
                .default("WINDOWS_SERVER,LINUX_SERVER")
                .describe("Comma-separated NinjaOne OS type filter (e.g. WINDOWS_SERVER,LINUX_SERVER)"),
            org_id: z
                .number()
                .int()
                .optional()
                .describe("Filter to a specific organization ID"),
            page_size: z.number().int().min(1).max(200).default(50),
            after: z
                .string()
                .optional()
                .describe("Cursor from previous response for pagination"),
        }),
    }, async ({ os_filter, org_id, page_size, after }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const params = {
                pageSize: page_size,
                filter: os_filter
                    .split(",")
                    .map((t) => `osType:${t.trim()}`)
                    .join(","),
            };
            if (org_id !== undefined)
                params["organizationId"] = org_id;
            if (after)
                params["after"] = after;
            const res = await ninjaClient(token).get("/devices", { params });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("ninja_get_server", {
        description: "Get detailed information about a specific NinjaOne-managed server: hardware specs, OS version, IP, agent version, and uptime.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
        }),
    }, async ({ device_id }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const res = await ninjaClient(token).get(`/device/${device_id}`);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    // ── Windows Services ───────────────────────────────────────────────────────
    server.registerTool("ninja_list_services", {
        description: "List Windows services on a NinjaOne-managed server with their state (Running/Stopped) and startup type.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            filter: z
                .string()
                .optional()
                .describe("Optional service name filter (partial match)"),
        }),
    }, async ({ device_id, filter }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const params = filter ? { filter: `name:${filter}` } : {};
            const res = await ninjaClient(token).get(`/device/${device_id}/windows/services`, {
                params,
            });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("ninja_manage_service", {
        description: "Start, stop, or restart a Windows service on a NinjaOne-managed server.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            service_name: z
                .string()
                .describe("Windows service name (not display name, e.g. 'MSSQLSERVER')"),
            action: z
                .enum(["start", "stop", "restart"])
                .describe("Action to perform on the service"),
        }),
    }, async ({ device_id, service_name, action }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const res = await ninjaClient(token).post(`/device/${device_id}/windows/services/${service_name}/${action}`);
            return ok(res.data ?? { success: true, service: service_name, action });
        }
        catch (e) {
            return err(e);
        }
    });
    // ── Processes ──────────────────────────────────────────────────────────────
    server.registerTool("ninja_list_processes", {
        description: "List running processes on a NinjaOne-managed server with CPU and memory usage.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            filter: z
                .string()
                .optional()
                .describe("Filter by process name (partial match)"),
        }),
    }, async ({ device_id, filter }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const params = filter ? { filter: `name:${filter}` } : {};
            const res = await ninjaClient(token).get(`/device/${device_id}/processes`, { params });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("ninja_terminate_process", {
        description: "Terminate (kill) a running process on a NinjaOne-managed server by process ID.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            process_id: z.number().int().describe("PID of the process to terminate"),
        }),
    }, async ({ device_id, process_id }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const res = await ninjaClient(token).delete(`/device/${device_id}/processes/${process_id}`);
            return ok(res.data ?? { success: true, terminated_pid: process_id });
        }
        catch (e) {
            return err(e);
        }
    });
    // ── Scripting ──────────────────────────────────────────────────────────────
    server.registerTool("ninja_run_script", {
        description: "Execute a PowerShell or Bash script on a NinjaOne-managed server. " +
            "Returns a result_id — use ninja_get_script_result to fetch output once complete.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            script_type: z
                .enum(["POWERSHELL", "CMD", "BASH"])
                .describe("Script interpreter"),
            script_body: z
                .string()
                .describe("The script content to execute"),
            script_id: z
                .number()
                .int()
                .optional()
                .describe("Optional: use a pre-saved NinjaOne script by its ID instead of script_body"),
        }),
    }, async ({ device_id, script_type, script_body, script_id }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const body = { scriptType: script_type };
            if (script_id !== undefined) {
                body["scriptId"] = script_id;
            }
            else {
                body["scriptBody"] = script_body;
            }
            const res = await ninjaClient(token).post(`/device/${device_id}/script/run`, body);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("ninja_get_script_result", {
        description: "Get the output, exit code, and status of a previously queued script execution on a NinjaOne device.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            result_id: z.number().int().describe("Script result ID returned by ninja_run_script"),
        }),
    }, async ({ device_id, result_id }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const res = await ninjaClient(token).get(`/device/${device_id}/script/result/${result_id}`);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    // ── Patching ───────────────────────────────────────────────────────────────
    server.registerTool("ninja_list_pending_patches", {
        description: "List available (not yet installed) patches for a NinjaOne-managed server, with KB article, severity, and reboot requirement.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            severity: z
                .enum(["critical", "important", "moderate", "low", "unspecified"])
                .optional()
                .describe("Filter by patch severity"),
        }),
    }, async ({ device_id, severity }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const params = { status: "PENDING" };
            if (severity)
                params["severity"] = severity.toUpperCase();
            const res = await ninjaClient(token).get(`/device/${device_id}/patches`, { params });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("ninja_approve_patches", {
        description: "Approve one or more patches for installation on a NinjaOne-managed server. Optionally schedule the installation.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            patch_ids: z
                .array(z.string())
                .min(1)
                .describe("Array of patch IDs to approve"),
            schedule_after: z
                .string()
                .optional()
                .describe("Schedule installation after this ISO 8601 timestamp"),
        }),
    }, async ({ device_id, patch_ids, schedule_after }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const body = { patchIds: patch_ids };
            if (schedule_after)
                body["scheduleAfter"] = schedule_after;
            const res = await ninjaClient(token).post(`/device/${device_id}/patches/approve`, body);
            return ok(res.data ?? { success: true, approved: patch_ids.length });
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("ninja_get_patch_history", {
        description: "Get the list of patches that have already been installed on a NinjaOne-managed server.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            page_size: z.number().int().min(1).max(200).default(50),
        }),
    }, async ({ device_id, page_size }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const res = await ninjaClient(token).get(`/device/${device_id}/patches`, {
                params: { status: "INSTALLED", pageSize: page_size },
            });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    // ── Disk & Storage ─────────────────────────────────────────────────────────
    server.registerTool("ninja_list_volumes", {
        description: "List disk volumes on a NinjaOne-managed server with total size, free space, and percent used.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
        }),
    }, async ({ device_id }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const res = await ninjaClient(token).get(`/device/${device_id}/volumes`);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    // ── Event Logs ─────────────────────────────────────────────────────────────
    server.registerTool("ninja_get_event_logs", {
        description: "Query Windows Event Log entries on a NinjaOne-managed server. " +
            "Supports System, Security, and Application logs with filtering by level and source.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            log_name: z
                .enum(["System", "Security", "Application"])
                .default("System")
                .describe("Windows Event Log channel"),
            level: z
                .enum(["Error", "Warning", "Information", "Critical"])
                .optional()
                .describe("Filter by event severity level"),
            source: z.string().optional().describe("Filter by event source (e.g. MSSQLSERVER)"),
            event_id: z.number().int().optional().describe("Filter by specific event ID"),
            page_size: z.number().int().min(1).max(500).default(50),
        }),
    }, async ({ device_id, log_name, level, source, event_id, page_size }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const filters = [];
            if (level)
                filters.push(`level:${level}`);
            if (source)
                filters.push(`source:${source}`);
            if (event_id)
                filters.push(`eventId:${event_id}`);
            const params = {
                logName: log_name,
                pageSize: page_size,
            };
            if (filters.length)
                params["filter"] = filters.join(",");
            const res = await ninjaClient(token).get(`/device/${device_id}/windows/eventlogs`, {
                params,
            });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    // ── Alerts ─────────────────────────────────────────────────────────────────
    server.registerTool("ninja_list_device_alerts", {
        description: "List active alerts for a specific NinjaOne-managed server, with severity and description.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
        }),
    }, async ({ device_id }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const res = await ninjaClient(token).get(`/device/${device_id}/alerts`);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("ninja_acknowledge_alert", {
        description: "Acknowledge or clear (resolve) an alert in NinjaOne, optionally with a note.",
        inputSchema: z.object({
            alert_id: z.string().describe("NinjaOne alert ID (uid)"),
            action: z
                .enum(["acknowledge", "clear"])
                .describe("acknowledge = mark as seen; clear = resolve/close the alert"),
            note: z.string().optional().describe("Optional note to attach when acknowledging"),
        }),
    }, async ({ alert_id, action, note }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            if (action === "clear") {
                const res = await ninjaClient(token).delete(`/alert/${alert_id}`);
                return ok(res.data ?? { success: true, alert_id, action: "cleared" });
            }
            const body = {};
            if (note)
                body["note"] = note;
            const res = await ninjaClient(token).put(`/alert/${alert_id}/acknowledge`, body);
            return ok(res.data ?? { success: true, alert_id, action: "acknowledged" });
        }
        catch (e) {
            return err(e);
        }
    });
    // ── Maintenance Mode ───────────────────────────────────────────────────────
    server.registerTool("ninja_set_maintenance_mode", {
        description: "Put a NinjaOne-managed server into maintenance mode to suppress alerts and monitoring during planned work.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
            duration_seconds: z
                .number()
                .int()
                .min(300)
                .max(86400)
                .describe("Maintenance window duration in seconds (min 5 min, max 24 h)"),
            reason: z.string().optional().describe("Reason for maintenance (shown in audit log)"),
        }),
    }, async ({ device_id, duration_seconds, reason }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const body = { enabled: true, duration: duration_seconds };
            if (reason)
                body["reason"] = reason;
            const res = await ninjaClient(token).put(`/device/${device_id}/maintenance`, body);
            return ok(res.data ?? { success: true, device_id, maintenance: true, duration_seconds });
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("ninja_exit_maintenance_mode", {
        description: "Remove a NinjaOne-managed server from maintenance mode and resume normal monitoring.",
        inputSchema: z.object({
            device_id: z.number().int().describe("NinjaOne device ID"),
        }),
    }, async ({ device_id }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getNinjaToken();
            const res = await ninjaClient(token).delete(`/device/${device_id}/maintenance`);
            return ok(res.data ?? { success: true, device_id, maintenance: false });
        }
        catch (e) {
            return err(e);
        }
    });
}
//# sourceMappingURL=ninjaone.js.map