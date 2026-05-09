import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE, formatError } from "../utils/http.js";

const DISABLED_MSG =
  "Graph service not configured: set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerOutlookCalendarTools(server: McpServer, enabled: boolean): void {
  server.registerTool(
    "calendar_list_events",
    {
      description:
        "List calendar events in a date range. Returns subject, organizer, attendees, start/end times, and location.",
      inputSchema: z.object({
        start: z
          .string()
          .describe("Range start in ISO 8601 (e.g. 2025-05-12T00:00:00)"),
        end: z
          .string()
          .describe("Range end in ISO 8601 (e.g. 2025-05-12T23:59:59)"),
        user_id: z
          .string()
          .optional()
          .describe("UPN or object ID. Defaults to the service account."),
        top: z.number().int().min(1).max(100).default(50),
      }),
    },
    async ({ start, end, user_id, top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const res = await graphClient(token).get(`${base}/calendarView`, {
          params: {
            startDateTime: start,
            endDateTime: end,
            $top: top,
            $orderby: "start/dateTime",
            $select:
              "id,subject,organizer,attendees,start,end,location,isOnlineMeeting,onlineMeetingUrl,bodyPreview,showAs,isCancelled",
          },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "calendar_get_event",
    {
      description: "Get full details of a specific calendar event.",
      inputSchema: z.object({
        event_id: z.string().describe("Event ID"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ event_id, user_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const res = await graphClient(token).get(`${base}/events/${event_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "calendar_create_event",
    {
      description: "Create a new calendar event.",
      inputSchema: z.object({
        subject: z.string().describe("Event title"),
        start: z.string().describe("Start time in ISO 8601 (e.g. 2025-05-15T14:00:00)"),
        end: z.string().describe("End time in ISO 8601"),
        timezone: z.string().default("America/Chicago").describe("IANA timezone for start/end"),
        body: z.string().optional().describe("Event body / agenda"),
        body_type: z.enum(["text", "html"]).default("text"),
        attendees: z
          .array(z.string())
          .optional()
          .describe("Attendee email addresses"),
        location: z.string().optional().describe("Location name"),
        is_online: z
          .boolean()
          .default(false)
          .describe("Create as Teams meeting"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ subject, start, end, timezone, body, body_type, attendees, location, is_online, user_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const payload: Record<string, unknown> = {
          subject,
          start: { dateTime: start, timeZone: timezone },
          end: { dateTime: end, timeZone: timezone },
          isOnlineMeeting: is_online,
          ...(body ? { body: { contentType: body_type, content: body } } : {}),
          ...(location ? { location: { displayName: location } } : {}),
          ...(attendees?.length
            ? {
                attendees: attendees.map((a) => ({
                  emailAddress: { address: a },
                  type: "required",
                })),
              }
            : {}),
        };
        const res = await graphClient(token).post(`${base}/events`, payload);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "calendar_update_event",
    {
      description: "Update an existing calendar event (subject, time, location, attendees, or body).",
      inputSchema: z.object({
        event_id: z.string().describe("Event ID"),
        subject: z.string().optional(),
        start: z.string().optional().describe("New start time in ISO 8601"),
        end: z.string().optional().describe("New end time in ISO 8601"),
        timezone: z.string().optional().describe("IANA timezone"),
        body: z.string().optional(),
        body_type: z.enum(["text", "html"]).default("text"),
        location: z.string().optional(),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ event_id, subject, start, end, timezone, body, body_type, location, user_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const tz = timezone ?? "America/Chicago";
        const payload: Record<string, unknown> = {};
        if (subject) payload.subject = subject;
        if (start) payload.start = { dateTime: start, timeZone: tz };
        if (end) payload.end = { dateTime: end, timeZone: tz };
        if (body) payload.body = { contentType: body_type, content: body };
        if (location) payload.location = { displayName: location };
        const res = await graphClient(token).patch(`${base}/events/${event_id}`, payload);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "calendar_delete_event",
    {
      description: "Delete (cancel) a calendar event.",
      inputSchema: z.object({
        event_id: z.string().describe("Event ID"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ event_id, user_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        await graphClient(token).delete(`${base}/events/${event_id}`);
        return ok({ deleted: true, event_id });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "calendar_find_meeting_times",
    {
      description:
        "Find available meeting slots for a set of attendees within a time window. " +
        "Returns ranked suggestions with attendee availability.",
      inputSchema: z.object({
        attendees: z.array(z.string()).describe("Attendee email addresses"),
        duration_minutes: z.number().int().default(60).describe("Meeting duration in minutes"),
        start: z
          .string()
          .describe("Search window start in ISO 8601 (e.g. 2025-05-15T08:00:00)"),
        end: z
          .string()
          .describe("Search window end in ISO 8601 (e.g. 2025-05-16T17:00:00)"),
        timezone: z.string().default("America/Chicago").describe("IANA timezone"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ attendees, duration_minutes, start, end, timezone, user_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const payload = {
          attendees: attendees.map((a) => ({ emailAddress: { address: a }, type: "required" })),
          timeConstraint: {
            activityDomain: "work",
            timeslots: [{ start: { dateTime: start, timeZone: timezone }, end: { dateTime: end, timeZone: timezone } }],
          },
          meetingDuration: `PT${duration_minutes}M`,
          returnSuggestionReasons: true,
          minimumAttendeePercentage: 100,
        };
        const res = await graphClient(token).post(`${base}/findMeetingTimes`, payload);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "calendar_list_rooms",
    {
      description: "List meeting rooms available in the tenant.",
      inputSchema: z.object({
        top: z.number().int().default(50).describe("Max rooms to return"),
      }),
    },
    async ({ top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/places/microsoft.graph.room", {
          params: { $top: top, $select: "id,displayName,emailAddress,capacity,building,floorNumber,isWheelChairAccessible" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
