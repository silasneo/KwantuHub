import { describe, expect, it, vi } from "vitest";
import { mountTurnstileWidget, type TurnstileOptions } from "../client/src/lib/turnstile";

describe("single-use client challenge lifecycle", () => {
  it("removes old widgets and tokens before rendering a fresh challenge", () => {
    const options: TurnstileOptions[] = [];
    const api = { render: vi.fn((_element, input) => { options.push(input); return `widget-${options.length}`; }), remove: vi.fn() };
    const receive = vi.fn();
    const dispose = mountTurnstileWidget(api, {} as HTMLElement, "site-key", "publish_listing", receive);
    options[0].callback("single-use-token-1");
    expect(receive).toHaveBeenLastCalledWith("single-use-token-1");
    dispose();
    expect(api.remove).toHaveBeenCalledWith("widget-1");
    expect(receive).toHaveBeenLastCalledWith(undefined);
    options[0].callback("late-spent-token");
    expect(receive).toHaveBeenLastCalledWith(undefined);
    const disposeNext = mountTurnstileWidget(api, {} as HTMLElement, "site-key", "publish_listing", receive);
    options[1].callback("single-use-token-2");
    expect(receive).toHaveBeenLastCalledWith("single-use-token-2");
    options[1]["expired-callback"]();
    expect(receive).toHaveBeenLastCalledWith(undefined);
    options[1].callback("replacement-token");
    options[1]["error-callback"]();
    expect(receive).toHaveBeenLastCalledWith(undefined);
    disposeNext();
    expect(api.remove).toHaveBeenCalledWith("widget-2");
  });
});
