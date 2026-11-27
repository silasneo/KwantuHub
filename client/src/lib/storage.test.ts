import { describe, expect, it } from "vitest";
import { mediaUrl } from "./storage";

describe("mediaUrl", () => {
  it("resolves stable public object keys through the app media route", () => {
    expect(mediaUrl("public/brand mark.svg")).toBe(
      "/media/public/brand%20mark.svg"
    );
  });

  it("converts legacy Manus storage paths during migration", () => {
    expect(mediaUrl("/manus-storage/photo.jpg")).toBe(
      "/media/public/photo.jpg"
    );
  });

  it("preserves explicit remote URLs and rejects private keys", () => {
    expect(mediaUrl("https://cdn.example.test/photo.jpg")).toBe(
      "https://cdn.example.test/photo.jpg"
    );
    expect(mediaUrl("private/verification/document.pdf")).toBe("");
  });
});
