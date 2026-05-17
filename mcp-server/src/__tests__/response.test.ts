import { describe, it, expect } from "vitest";
import { ok, err, cfgErr } from "../utils/response.js";
import { AxiosError, AxiosHeaders } from "axios";

describe("ok", () => {
  it("wraps data as JSON text content", () => {
    const result = ok({ id: 1, name: "test" });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(JSON.parse(result.content[0]!.text)).toEqual({ id: 1, name: "test" });
  });

  it("handles null", () => {
    const result = ok(null);
    expect(JSON.parse(result.content[0]!.text)).toBeNull();
  });

  it("handles arrays", () => {
    const result = ok([1, 2, 3]);
    expect(JSON.parse(result.content[0]!.text)).toEqual([1, 2, 3]);
  });
});

describe("err", () => {
  it("marks result as error for a plain Error", () => {
    const result = err(new Error("something went wrong"));
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("something went wrong");
  });

  it("marks result as error for an AxiosError", () => {
    const axErr = new AxiosError("network fail", "ERR_NETWORK");
    const result = err(axErr);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("network fail");
  });

  it("marks result as error for an unknown value", () => {
    const result = err("raw string error");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("raw string error");
  });
});

describe("cfgErr", () => {
  it("returns an error result with the given message", () => {
    const result = cfgErr("GRAPH_CLIENT_ID is not configured");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("GRAPH_CLIENT_ID is not configured");
  });
});
