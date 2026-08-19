import { describe, expect, it } from "vitest";
import { acceptedMimeTypes, cleanFileName, decodeBase64, MAX_ASSET_BYTES } from "./vendorAssets";

describe("vendor asset storage guards", () => {
  it("allows only the supported image and document upload types", () => {
    expect(acceptedMimeTypes).toEqual(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    expect(MAX_ASSET_BYTES).toBe(5 * 1024 * 1024);
  });

  it("normalizes source filenames and decodes browser data URLs", () => {
    expect(cleanFileName("Aunty Eki's header image!.png")).toBe("Aunty-Eki-s-header-image-.png");
    expect(decodeBase64("data:text/plain;base64,a3dhbnR1").toString("utf8")).toBe("kwantu");
  });
});
