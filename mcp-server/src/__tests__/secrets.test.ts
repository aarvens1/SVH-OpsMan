import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadBitwardenSecrets } from "../secrets.js";

describe("loadBitwardenSecrets", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env["BW_SESSION"];
    delete process.env["BW_SESSION"];
  });

  afterEach(() => {
    if (saved !== undefined) {
      process.env["BW_SESSION"] = saved;
    } else {
      delete process.env["BW_SESSION"];
    }
  });

  it("throws a descriptive error when BW_SESSION is not set", async () => {
    await expect(loadBitwardenSecrets()).rejects.toThrow(
      "BW_SESSION is not set"
    );
  });
});
