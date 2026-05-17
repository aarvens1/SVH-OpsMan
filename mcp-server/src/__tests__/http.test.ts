import { describe, it, expect } from "vitest";
import { formatError } from "../utils/http.js";
import { AxiosError, AxiosHeaders } from "axios";

function axiosErr(
  status: number,
  data: unknown,
  statusText = "Error",
  noResponse = false
): AxiosError {
  const cfg = { headers: new AxiosHeaders() } as Parameters<typeof AxiosError>[2];
  const response = noResponse
    ? undefined
    : { status, statusText, data, headers: {}, config: cfg! };
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", cfg, {}, response as any);
}

describe("formatError", () => {
  describe("AxiosError with response", () => {
    it("extracts Graph API nested error message", () => {
      const e = axiosErr(404, { error: { code: "Request_ResourceNotFound", message: "User not found" } });
      expect(formatError(e)).toBe("HTTP 404: User not found");
    });

    it("prefers data.message over nested error", () => {
      const e = axiosErr(400, { message: "Top-level message", error: { message: "Nested message" } });
      expect(formatError(e)).toBe("HTTP 400: Top-level message");
    });

    it("uses data.error when it is a plain string", () => {
      const e = axiosErr(401, { error: "Unauthorized" });
      expect(formatError(e)).toBe("HTTP 401: Unauthorized");
    });

    it("uses data.errors field", () => {
      const e = axiosErr(422, { errors: "Validation failed" });
      expect(formatError(e)).toBe("HTTP 422: Validation failed");
    });

    it("falls back to statusText when data has no message fields", () => {
      const e = axiosErr(404, {}, "Not Found");
      expect(formatError(e)).toBe("HTTP 404: Not Found");
    });

    it("falls back to err.message when data is null", () => {
      const e = axiosErr(500, null, "Internal Server Error");
      expect(formatError(e)).toBe("HTTP 500: Internal Server Error");
    });
  });

  describe("AxiosError without response (network error)", () => {
    it("returns the error message without an HTTP prefix", () => {
      const e = axiosErr(0, null, "", true);
      expect(formatError(e)).not.toMatch(/^HTTP/);
      expect(formatError(e)).toBe("Request failed");
    });
  });

  describe("non-Axios errors", () => {
    it("returns message for a plain Error", () => {
      expect(formatError(new Error("something broke"))).toBe("something broke");
    });

    it("stringifies arbitrary values", () => {
      expect(formatError("raw string")).toBe("raw string");
      expect(formatError(42)).toBe("42");
      expect(formatError({ custom: true })).toBe("[object Object]");
    });
  });
});
