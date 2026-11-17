import { describe, expect, it } from "vitest";
import { healthController } from "./health.controller";

describe("healthController", () => {
  it("responde 200 com status ok", async () => {
    const response = await healthController.check();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
