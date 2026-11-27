import { afterEach, expect, it, vi } from "vitest";
import { notifyOwner } from "./_core/notification";

afterEach(() => vi.unstubAllGlobals());
it("explicitly disables legacy owner notifications without Forge configuration or network calls", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    notifyOwner({ title: "Notice", content: "Body" })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  expect(fetch).not.toHaveBeenCalled();
});
