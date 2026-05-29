import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerOutlookCalendarTools } from "../../tools/outlook-calendar.js";
import { getGraphToken } from "../../auth/graph.js";

// Mock graphClient to avoid hoisting issues with vi.mock
const mockGraphClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn(() => mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn(),
}));

vi.mock("../../utils/response.js", () => ({
  ok: (data: any) => ({ ok: true, data }),
  err: (e: any) => ({ ok: false, error: { message: e.message || "An error occurred" } }),
  cfgErr: (msg: string) => ({ ok: false, error: { message: msg } }),
}));

// These imports must be after mocks
import { graphClient } from "../../utils/http.js";

describe("Outlook Calendar Tools", () => {
  let server: McpServer;
  let registeredTools: Map<string, any>;
  const testUserId = "test-user@example.com";
  const NO_USER_MSG = "Calendar tools are not configured: set GRAPH_USER_ID to your UPN (e.g. you@company.com)";


  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();
    server = {
      registerTool: (name: string, schema: any, handler: any) => {
        registeredTools.set(name, { name, schema, handler });
      },
    } as any;
    registerOutlookCalendarTools(server, true, testUserId);
  });

  it("should not register tools if disabled", () => {
    registeredTools.clear();
    const mockServer = { registerTool: vi.fn() };
    registerOutlookCalendarTools(mockServer as any, false, testUserId);
    expect(mockServer.registerTool).not.toHaveBeenCalled();
  });
  
  it("should return config error if user ID is not provided", async () => {
    registeredTools.clear();
    registerOutlookCalendarTools(server, true, undefined);
    const handler = registeredTools.get("calendar_list_events")?.handler;
    expect(handler).toBeDefined();

    const result = await handler({ start: "2025-01-01T00:00:00", end: "2025-01-01T23:59:59" });
    expect(result).toEqual({ ok: false, error: { message: NO_USER_MSG } });
  });

  describe("calendar_list_events", () => {
    const toolName = "calendar_list_events";
    const mockEventListResponse = {
      data: {
        value: [
          {
            id: "evt1",
            subject: "Team Sync",
            start: { dateTime: "2025-05-12T10:00:00.0000000", timeZone: "UTC" },
            end: { dateTime: "2025-05-12T10:30:00.0000000", timeZone: "UTC" },
            location: { displayName: "Virtual" },
            organizer: { emailAddress: { name: "John Doe", address: "john.doe@example.com" } },
            attendees: [
              {
                type: "required",
                status: { response: "accepted", time: "2025-05-10T10:00:00Z" },
                emailAddress: { name: "Jane Smith", address: "jane.smith@example.com" }
              }
            ],
            isOnlineMeeting: true,
            onlineMeetingUrl: "https://teams.microsoft.com/...",
            bodyPreview: "Agenda...",
            showAs: "busy",
            isCancelled: false,
          },
        ],
      },
    };

    it("should list calendar events on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockEventListResponse);

      const result = await handler({
        start: "2025-05-12T00:00:00",
        end: "2025-05-12T23:59:59",
        top: 1,
      });

      expect(getGraphToken).toHaveBeenCalledWith("https://graph.microsoft.com/.default");
      expect(graphClient).toHaveBeenCalledWith("fake-token");
      expect(mockGraphClient.get).toHaveBeenCalledWith(`/users/${testUserId}/calendarView`, {
        params: {
          startDateTime: "2025-05-12T00:00:00",
          endDateTime: "2025-05-12T23:59:59",
          $top: 1,
          $orderby: "start/dateTime",
          $select:
            "id,subject,organizer,attendees,start,end,location,isOnlineMeeting,onlineMeetingUrl,bodyPreview,showAs,isCancelled",
        },
      });

      expect(result.ok).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.events[0].subject).toBe("Team Sync");
    });

    it("should handle errors when listing events", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("API Error");
      vi.mocked(mockGraphClient.get).mockRejectedValue(error);

      const result = await handler({ start: "2025-05-12T00:00:00", end: "2025-05-12T23:59:59" });
      
      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "API Error" });
    });
  });

  describe("calendar_get_event", () => {
    const toolName = "calendar_get_event";
    const mockEventGetResponse = {
      data: {
        id: "evt1",
        subject: "Project Kick-off",
        start: { dateTime: "2025-05-13T14:00:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2025-05-13T15:00:00.0000000", timeZone: "UTC" },
        body: { contentType: "html", content: "<html><body>...</body></html>" },
        isAllDay: false,
        recurrence: null,
        sensitivity: "normal",
        categories: ["Project"],
      },
    };

    it("should get event details on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockEventGetResponse);

      const result = await handler({ event_id: "evt1" });

      expect(mockGraphClient.get).toHaveBeenCalledWith(`/users/${testUserId}/events/evt1`);
      expect(result.ok).toBe(true);
      expect(result.data.subject).toBe("Project Kick-off");
      expect(result.data.body).toContain("<html>");
    });

    it("should handle errors when getting an event", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.get).mockRejectedValue(new Error("Not Found"));

      const result = await handler({ event_id: "evt1" });

      expect(result.ok).toBe(false);
      expect(result.error?.message).toBe("Not Found");
    });
  });

  describe("calendar_create_event", () => {
    const toolName = "calendar_create_event";
    const mockEventCreateResponse = {
      data: {
        id: "evt2",
        subject: "New Event",
        start: { dateTime: "2025-05-15T14:00:00", timeZone: "America/Los_Angeles" },
        end: { dateTime: "2025-05-15T15:00:00", timeZone: "America/Los_Angeles" },
        isOnlineMeeting: true,
        onlineMeetingUrl: "https://teams.microsoft.com/...",
        webLink: "https://outlook.office.com/...",
      },
    };

    it("should create an event on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.post).mockResolvedValue(mockEventCreateResponse);

      const result = await handler({
        subject: "New Event",
        start: "2025-05-15T14:00:00",
        end: "2025-05-15T15:00:00",
        attendees: ["jane.smith@example.com"],
        is_online: true,
      });

      expect(mockGraphClient.post).toHaveBeenCalledWith(
        `/users/${testUserId}/events`,
        expect.objectContaining({
          subject: "New Event",
          isOnlineMeeting: true,
        })
      );
      expect(result.ok).toBe(true);
      expect(result.data.id).toBe("evt2");
    });
    
    it("should handle errors when creating an event", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.post).mockRejectedValue(new Error("Failed to create"));

      const result = await handler({ subject: "New Event", start: "2025-05-15T14:00:00", end: "2025-05-15T15:00:00" });
      
      expect(result.ok).toBe(false);
      expect(result.error?.message).toBe("Failed to create");
    });
  });
  
  describe("calendar_update_event", () => {
    const toolName = "calendar_update_event";
    const mockEventUpdateResponse = {
      data: {
        id: "evt1",
        subject: "Updated Subject",
        start: { dateTime: "2025-05-13T14:30:00", timeZone: "America/Los_Angeles" },
        end: { dateTime: "2025-05-13T15:30:00", timeZone: "America/Los_Angeles" },
        webLink: "https://outlook.office.com/...",
      },
    };

    it("should update an event on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.patch).mockResolvedValue(mockEventUpdateResponse);

      const result = await handler({ event_id: "evt1", subject: "Updated Subject" });

      expect(mockGraphClient.patch).toHaveBeenCalledWith(
        `/users/${testUserId}/events/evt1`,
        { subject: "Updated Subject" }
      );
      expect(result.ok).toBe(true);
      expect(result.data.subject).toBe("Updated Subject");
    });

    it("should handle errors when updating an event", async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue("fake-token");
        vi.mocked(mockGraphClient.patch).mockRejectedValue(new Error("Update failed"));
        
        const result = await handler({ event_id: "evt1", subject: "New Subject" });
        
        expect(result.ok).toBe(false);
        expect(result.error?.message).toBe("Update failed");
    });
  });

  describe("calendar_delete_event", () => {
    const toolName = "calendar_delete_event";

    it("should delete an event on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.delete).mockResolvedValue({ status: 204 });

      const result = await handler({ event_id: "evt1" });

      expect(mockGraphClient.delete).toHaveBeenCalledWith(`/users/${testUserId}/events/evt1`);
      expect(result).toEqual({ ok: true, data: { deleted: true, event_id: "evt1" } });
    });

    it("should handle errors when deleting an event", async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue("fake-token");
        vi.mocked(mockGraphClient.delete).mockRejectedValue(new Error("Delete failed"));
        
        const result = await handler({ event_id: "evt1" });
        
        expect(result.ok).toBe(false);
        expect(result.error?.message).toBe("Delete failed");
    });
  });

  describe("calendar_find_meeting_times", () => {
    const toolName = "calendar_find_meeting_times";
    const mockFindTimesResponse = {
        data: {
            emptySuggestionsReason: null,
            meetingTimeSuggestions: [
                {
                    confidence: 100,
                    organizerAvailability: "free",
                    suggestionReason: "Suggested because it is free for all attendees.",
                    meetingTimeSlot: {
                        start: { dateTime: "2025-05-15T10:00:00", timeZone: "America/Los_Angeles" },
                        end: { dateTime: "2025-05-15T11:00:00", timeZone: "America/Los_Angeles" }
                    },
                    attendeeAvailability: [{ attendee: { emailAddress: { address: "jane.smith@example.com" } }, availability: "free" }],
                }
            ]
        }
    };

    it("should find meeting times on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.post).mockResolvedValue(mockFindTimesResponse);

      const result = await handler({
        attendees: ["jane.smith@example.com"],
        duration_minutes: 60,
        start: "2025-05-15T08:00:00",
        end: "2025-05-15T17:00:00",
      });

      expect(mockGraphClient.post).toHaveBeenCalledWith(`/users/${testUserId}/findMeetingTimes`, expect.any(Object));
      expect(result.ok).toBe(true);
      expect(result.data.meetingTimeSuggestions.length).toBe(1);
      expect(result.data.meetingTimeSuggestions[0].confidence).toBe(100);
    });

    it("should handle errors when finding meeting times", async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue("fake-token");
        vi.mocked(mockGraphClient.post).mockRejectedValue(new Error("API Error"));

        const result = await handler({ attendees: [], start: "2025-01-01", end: "2025-01-02" });

        expect(result.ok).toBe(false);
        expect(result.error?.message).toBe("API Error");
    });
  });

  describe("calendar_list_rooms", () => {
    const toolName = "calendar_list_rooms";
    const mockListRoomsResponse = {
      data: {
        value: [
          {
            id: "room1",
            displayName: "Conference Room 1",
            emailAddress: "cr1@example.com",
            capacity: 10,
          },
        ],
      },
    };

    it("should list rooms on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockListRoomsResponse);

      const result = await handler({ top: 10 });

      expect(mockGraphClient.get).toHaveBeenCalledWith("/places/microsoft.graph.room", expect.any(Object));
      expect(result.ok).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.rooms[0].displayName).toBe("Conference Room 1");
    });

    it("should handle errors when listing rooms", async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue("fake-token");
        vi.mocked(mockGraphClient.get).mockRejectedValue(new Error("API Error"));

        const result = await handler({ top: 10 });

        expect(result.ok).toBe(false);
        expect(result.error?.message).toBe("API Error");
    });
  });
});
