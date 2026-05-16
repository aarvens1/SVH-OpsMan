import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err, cfgErr } from "../utils/response.js";

type A = Record<string, unknown>;

const NO_USER_MSG =
  "Calendar tools are not configured: set GRAPH_USER_ID to your UPN (e.g. you@company.com)";

// Calendar tools are scoped to a single mailbox (GRAPH_USER_ID).
// See outlook-mail.ts for the rationale.
export function registerOutlookCalendarTools(
  server: McpServer,
  enabled: boolean,
  userId: string | undefined
): void {
  if (!enabled) return;
  server.registerTool(
    "calendar_list_events",
    {
      description:
        "List your calendar events in a date range. Returns subject, organizer, attendees, start/end times, and location.",
      inputSchema: z.object({
        start: z
          .string()
          .describe("Range start in ISO 8601 (e.g. 2025-05-12T00:00:00)"),
        end: z
          .string()
          .describe("Range end in ISO 8601 (e.g. 2025-05-12T23:59:59)"),
        top: z.number().int().min(1).max(100).default(50),
      }),
    },
    async ({ start, end, top }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/users/${userId}/calendarView`, {
          params: {
            startDateTime: start,
            endDateTime: end,
            $top: top,
            $orderby: "start/dateTime",
            $select:
              "id,subject,organizer,attendees,start,end,location,isOnlineMeeting,onlineMeetingUrl,bodyPreview,showAs,isCancelled",
          },
        });
        type E = Record<string, unknown>;
        const events = ((res.data as E)["value"] as E[] ?? []).map((e: E) => ({
          id: e["id"],
          subject: e["subject"],
          start: e["start"],
          end: e["end"],
          location: (e["location"] as E | undefined)?.["displayName"],
          organizer: (e["organizer"] as E | undefined)?.["emailAddress"],
          attendees: (e["attendees"] as E[] | undefined)?.map((a: E) => ({
            name: (a["emailAddress"] as E | undefined)?.["name"],
            address: (a["emailAddress"] as E | undefined)?.["address"],
            type: a["type"],
            status: (a["status"] as E | undefined)?.["response"],
          })),
          isOnlineMeeting: e["isOnlineMeeting"],
          onlineMeetingUrl: e["onlineMeetingUrl"],
          bodyPreview: e["bodyPreview"],
          showAs: e["showAs"],
          isCancelled: e["isCancelled"],
        }));
        return ok({ count: events.length, events });
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
      }),
    },
    async ({ event_id }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/users/${userId}/events/${event_id}`);
        type E = Record<string, unknown>;
        const e = res.data as E;
        return ok({
          id: e["id"],
          subject: e["subject"],
          start: e["start"],
          end: e["end"],
          location: (e["location"] as E | undefined)?.["displayName"],
          organizer: (e["organizer"] as E | undefined)?.["emailAddress"],
          attendees: (e["attendees"] as E[] | undefined)?.map((a: E) => ({
            name: (a["emailAddress"] as E | undefined)?.["name"],
            address: (a["emailAddress"] as E | undefined)?.["address"],
            type: a["type"],
            status: (a["status"] as E | undefined)?.["response"],
          })),
          isOnlineMeeting: e["isOnlineMeeting"],
          onlineMeetingUrl: e["onlineMeetingUrl"],
          bodyPreview: e["bodyPreview"],
          body: (e["body"] as E | undefined)?.["content"],
          showAs: e["showAs"],
          isCancelled: e["isCancelled"],
          isAllDay: e["isAllDay"],
          recurrence: e["recurrence"],
          sensitivity: e["sensitivity"],
          categories: e["categories"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "calendar_create_event",
    {
      description: "Create a new calendar event in your calendar.",
      inputSchema: z.object({
        subject: z.string().describe("Event title"),
        start: z.string().describe("Start time in ISO 8601 (e.g. 2025-05-15T14:00:00)"),
        end: z.string().describe("End time in ISO 8601"),
        timezone: z.string().default("America/Los_Angeles").describe("IANA timezone for start/end"),
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
      }),
    },
    async ({ subject, start, end, timezone, body, body_type, attendees, location, is_online }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
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
        const res = await graphClient(token).post(`/users/${userId}/events`, payload);
        type E = Record<string, unknown>;
        const e = res.data as E;
        return ok({
          id: e["id"],
          subject: e["subject"],
          start: e["start"],
          end: e["end"],
          isOnlineMeeting: e["isOnlineMeeting"],
          onlineMeetingUrl: e["onlineMeetingUrl"],
          webLink: e["webLink"],
        });
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
      }),
    },
    async ({ event_id, subject, start, end, timezone, body, body_type, location }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const tz = timezone ?? "America/Los_Angeles";
        const payload: Record<string, unknown> = {};
        if (subject) payload.subject = subject;
        if (start) payload.start = { dateTime: start, timeZone: tz };
        if (end) payload.end = { dateTime: end, timeZone: tz };
        if (body) payload.body = { contentType: body_type, content: body };
        if (location) payload.location = { displayName: location };
        const res = await graphClient(token).patch(`/users/${userId}/events/${event_id}`, payload);
        type E = Record<string, unknown>;
        const e = res.data as E;
        return ok({
          id: e["id"],
          subject: e["subject"],
          start: e["start"],
          end: e["end"],
          location: (e["location"] as E | undefined)?.["displayName"],
          webLink: e["webLink"],
        });
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
      }),
    },
    async ({ event_id }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        await graphClient(token).delete(`/users/${userId}/events/${event_id}`);
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
        timezone: z.string().default("America/Los_Angeles").describe("IANA timezone"),
      }),
    },
    async ({ attendees, duration_minutes, start, end, timezone }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
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
        const res = await graphClient(token).post(`/users/${userId}/findMeetingTimes`, payload);
        type S = Record<string, unknown>;
        const data = res.data as S;
        const suggestions = ((data["meetingTimeSuggestions"] as S[] | undefined) ?? []).map((s: S) => ({
          confidence: s["confidence"],
          organizerAvailability: s["organizerAvailability"],
          suggestionReason: s["suggestionReason"],
          meetingTimeSlot: s["meetingTimeSlot"],
          attendeeAvailability: (s["attendeeAvailability"] as S[] | undefined)?.map((a: S) => ({
            attendee: (a["attendee"] as S | undefined)?.["emailAddress"],
            availability: a["availability"],
          })),
        }));
        return ok({
          emptySuggestionsReason: data["emptySuggestionsReason"],
          meetingTimeSuggestions: suggestions,
        });
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
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/places/microsoft.graph.room", {
          params: { $top: top, $select: "id,displayName,emailAddress,capacity,building,floorNumber,isWheelChairAccessible" },
        });
        const rooms = ((res.data as A)["value"] as A[] ?? []).map((r: A) => ({
          id: r["id"],
          displayName: r["displayName"],
          emailAddress: r["emailAddress"],
          capacity: r["capacity"],
          building: r["building"],
          floorNumber: r["floorNumber"],
          isWheelChairAccessible: r["isWheelChairAccessible"],
        }));
        return ok({ count: rooms.length, rooms });
      } catch (e) {
        return err(e);
      }
    }
  );
}
