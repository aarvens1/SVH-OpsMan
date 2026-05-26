import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGoogleToken } from "../auth/google.js";
import { ok, err, cfgErr } from "../utils/response.js";

type A = Record<string, unknown>;

const NO_USER_MSG =
  "Google tools are not configured — set GOOGLE_USER_EMAIL in the SVH OpsMan Bitwarden item";

const gmailClient = (token: string) =>
  axios.create({
    baseURL: "https://gmail.googleapis.com/gmail/v1",
    timeout: 30_000,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

const calendarClient = (token: string) =>
  axios.create({
    baseURL: "https://www.googleapis.com/calendar/v3",
    timeout: 30_000,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

const driveClient = (token: string) =>
  axios.create({
    baseURL: "https://www.googleapis.com/drive/v3",
    timeout: 30_000,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

function extractTextBody(payload: A): string {
  if (payload["mimeType"] === "text/plain" && payload["body"]) {
    const body = payload["body"] as A;
    const data = body["data"] as string | undefined;
    if (data) return Buffer.from(data, "base64url").toString("utf8");
  }
  const parts = payload["parts"] as A[] | undefined;
  if (parts) {
    for (const part of parts) {
      const text = extractTextBody(part);
      if (text) return text;
    }
  }
  return "";
}

export function registerGoogleTools(
  server: McpServer,
  enabled: boolean,
  userId: string | undefined
): void {
  if (!enabled) return;

  server.registerTool(
    "gmail_list_recent",
    {
      description:
        "List recent messages in your Gmail inbox. Returns sender, subject, date, snippet, and message ID.",
      inputSchema: z.object({
        max_results: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Maximum number of messages to return"),
        label: z
          .string()
          .default("INBOX")
          .describe("Gmail label to list (e.g. INBOX, SENT, or a custom label name)"),
      }),
    },
    async ({ max_results, label }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGoogleToken();
        const client = gmailClient(token);
        const listRes = await client.get(`/users/me/messages`, {
          params: { labelIds: label, maxResults: max_results },
        });
        const ids = ((listRes.data as A)["messages"] as A[] | undefined) ?? [];
        const msgs = await Promise.all(
          ids.map((m) =>
            client.get(`/users/me/messages/${m["id"] as string}`, {
              params: { format: "metadata", metadataHeaders: ["Subject", "From", "Date"] },
            })
          )
        );
        const shaped = msgs.map((r) => {
          const m = r.data as A;
          const headers = (m["payload"] as A | undefined)?.["headers"] as A[] | undefined ?? [];
          const header = (name: string) =>
            headers.find((h) => (h["name"] as string)?.toLowerCase() === name.toLowerCase())?.[
              "value"
            ];
          return {
            id: m["id"],
            threadId: m["threadId"],
            subject: header("Subject"),
            from: header("From"),
            date: header("Date"),
            snippet: m["snippet"],
          };
        });
        return ok({ count: shaped.length, messages: shaped });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "gmail_search",
    {
      description:
        "Search Gmail using Gmail query syntax (e.g. 'from:boss@company.com', 'subject:invoice is:unread', 'after:2025-05-01').",
      inputSchema: z.object({
        query: z.string().describe("Gmail search query"),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Maximum number of messages to return"),
      }),
    },
    async ({ query, max_results }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGoogleToken();
        const client = gmailClient(token);
        const listRes = await client.get(`/users/me/messages`, {
          params: { q: query, maxResults: max_results },
        });
        const ids = ((listRes.data as A)["messages"] as A[] | undefined) ?? [];
        const msgs = await Promise.all(
          ids.map((m) =>
            client.get(`/users/me/messages/${m["id"] as string}`, {
              params: { format: "metadata", metadataHeaders: ["Subject", "From", "Date"] },
            })
          )
        );
        const shaped = msgs.map((r) => {
          const m = r.data as A;
          const headers = (m["payload"] as A | undefined)?.["headers"] as A[] | undefined ?? [];
          const header = (name: string) =>
            headers.find((h) => (h["name"] as string)?.toLowerCase() === name.toLowerCase())?.[
              "value"
            ];
          return {
            id: m["id"],
            threadId: m["threadId"],
            subject: header("Subject"),
            from: header("From"),
            date: header("Date"),
            snippet: m["snippet"],
          };
        });
        return ok({ count: shaped.length, messages: shaped });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "gmail_get_message",
    {
      description:
        "Get the full content of a Gmail message including body text and attachment names.",
      inputSchema: z.object({
        message_id: z.string().describe("Gmail message ID"),
      }),
    },
    async ({ message_id }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGoogleToken();
        const client = gmailClient(token);
        const res = await client.get(`/users/me/messages/${message_id}`, {
          params: { format: "full" },
        });
        const m = res.data as A;
        const payload = (m["payload"] as A | undefined) ?? {};
        const headers = (payload["headers"] as A[] | undefined) ?? [];
        const header = (name: string) =>
          headers.find((h) => (h["name"] as string)?.toLowerCase() === name.toLowerCase())?.[
            "value"
          ];
        const body = extractTextBody(payload);
        const parts = (payload["parts"] as A[] | undefined) ?? [];
        const attachments = parts
          .filter((p) => {
            const body = p["body"] as A | undefined;
            return (p["filename"] as string | undefined) && body?.["attachmentId"];
          })
          .map((p) => ({
            name: p["filename"],
            mimeType: p["mimeType"],
            size: (p["body"] as A | undefined)?.["size"],
          }));
        return ok({
          id: m["id"],
          threadId: m["threadId"],
          subject: header("Subject"),
          from: header("From"),
          to: header("To"),
          date: header("Date"),
          snippet: m["snippet"],
          body,
          attachments,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "gcal_list_events",
    {
      description:
        "List Google Calendar events in a date range. Defaults to the next 7 days.",
      inputSchema: z.object({
        time_min: z
          .string()
          .optional()
          .describe("Start of range. Defaults to now."),
        time_max: z
          .string()
          .optional()
          .describe("End of range. Defaults to 7 days from now."),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Maximum number of events to return"),
        calendar_id: z
          .string()
          .default("primary")
          .describe("Calendar ID. Use 'primary' for the main calendar."),
      }),
    },
    async ({ time_min, time_max, max_results, calendar_id }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGoogleToken();
        const now = new Date();
        const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const res = await calendarClient(token).get(
          `/calendars/${encodeURIComponent(calendar_id)}/events`,
          {
            params: {
              timeMin: time_min ?? now.toISOString(),
              timeMax: time_max ?? sevenDaysOut.toISOString(),
              singleEvents: true,
              orderBy: "startTime",
              maxResults: max_results,
            },
          }
        );
        const events = ((res.data as A)["items"] as A[] | undefined) ?? [];
        const shaped = events.map((e) => ({
          id: e["id"],
          summary: e["summary"],
          start: (e["start"] as A | undefined)?.["dateTime"] ?? (e["start"] as A | undefined)?.["date"],
          end: (e["end"] as A | undefined)?.["dateTime"] ?? (e["end"] as A | undefined)?.["date"],
          location: e["location"],
          organizer: (e["organizer"] as A | undefined)?.["email"],
          attendeeCount: ((e["attendees"] as A[] | undefined) ?? []).length,
          description:
            typeof e["description"] === "string"
              ? e["description"].slice(0, 200)
              : undefined,
        }));
        return ok({ count: shaped.length, events: shaped });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "gcal_get_event",
    {
      description: "Get full details of a specific Google Calendar event.",
      inputSchema: z.object({
        event_id: z.string().describe("Google Calendar event ID"),
        calendar_id: z
          .string()
          .default("primary")
          .describe("Calendar ID. Use 'primary' for the main calendar."),
      }),
    },
    async ({ event_id, calendar_id }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGoogleToken();
        const res = await calendarClient(token).get(
          `/calendars/${encodeURIComponent(calendar_id)}/events/${event_id}`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "gdrive_list_files",
    {
      description:
        "List files and folders in Google Drive. Optionally filter by parent folder.",
      inputSchema: z.object({
        folder_id: z
          .string()
          .optional()
          .describe("Parent folder ID. Omit for My Drive root."),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(30)
          .describe("Number of files to return"),
        query: z
          .string()
          .optional()
          .describe("Additional Drive query string (e.g. \"mimeType='text/plain'\")"),
      }),
    },
    async ({ folder_id, page_size, query }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGoogleToken();
        let q = folder_id ? `'${folder_id}' in parents` : `'root' in parents`;
        if (query) q += ` and ${query}`;
        const res = await driveClient(token).get(`/files`, {
          params: {
            q,
            pageSize: page_size,
            fields: "files(id,name,mimeType,size,modifiedTime,parents)",
          },
        });
        const files = ((res.data as A)["files"] as A[] | undefined) ?? [];
        const shaped = files.map((f) => ({
          id: f["id"],
          name: f["name"],
          mimeType: f["mimeType"],
          size: f["size"],
          modifiedTime: f["modifiedTime"],
        }));
        return ok({ count: shaped.length, files: shaped });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "gdrive_create_folder",
    {
      description: "Create a folder in Google Drive.",
      inputSchema: z.object({
        name: z.string().describe("Name of the new folder"),
        parent_id: z
          .string()
          .optional()
          .describe("Parent folder ID. Omit for My Drive root."),
      }),
    },
    async ({ name, parent_id }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGoogleToken();
        const body: Record<string, unknown> = {
          name,
          mimeType: "application/vnd.google-apps.folder",
        };
        if (parent_id) body["parents"] = [parent_id];
        const res = await driveClient(token).post(`/files`, body, {
          params: { fields: "id,name,mimeType,webViewLink" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "gdrive_upload_text",
    {
      description:
        "Create or upload a text file to Google Drive. Use for saving notes, logs, or markdown content.",
      inputSchema: z.object({
        name: z.string().describe("Filename including extension"),
        content: z.string().describe("Text content to upload"),
        parent_id: z
          .string()
          .optional()
          .describe("Parent folder ID. Omit for My Drive root."),
        mime_type: z
          .string()
          .default("text/plain")
          .describe("MIME type, e.g. text/plain or text/markdown"),
      }),
    },
    async ({ name, content, parent_id, mime_type }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGoogleToken();
        const metadata: Record<string, unknown> = { name, mimeType: mime_type };
        if (parent_id) metadata["parents"] = [parent_id];
        const createRes = await driveClient(token).post(`/files`, metadata, {
          params: { fields: "id,name,mimeType" },
        });
        const fileId = (createRes.data as A)["id"] as string;
        try {
          const uploadRes = await axios.patch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}`,
            content,
            {
              params: { uploadType: "media", fields: "id,name,mimeType,size,webViewLink" },
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": mime_type,
              },
              timeout: 30_000,
            }
          );
          return ok(uploadRes.data);
        } catch (uploadErr) {
          await driveClient(token).delete(`/files/${fileId}`).catch(() => undefined);
          throw uploadErr;
        }
      } catch (e) {
        return err(e);
      }
    }
  );
}
