// @vitest-environment node
import { expect, it, vi } from "vitest";

it("initializes and tracks progress without a browser or persistent storage", async () => {
  vi.stubGlobal("localStorage", undefined);
  try {
    const { state } = await import("../state.js");
    expect(state.spiritShards).toBe(0);
    state.addShards(500);
    expect(state.buyCharacter("shadow")).toBe(true);
    expect(state.isUnlocked("shadow")).toBe(true);
    expect(state.spiritShards).toBe(0);
  } finally {
    vi.unstubAllGlobals();
  }
});
