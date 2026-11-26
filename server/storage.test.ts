import { describe, expect, it } from "vitest";
import {
  getPublicMediaUrl,
  normalizeStorageKey,
} from "./storage";

describe("S3 storage key helpers", () => {
  it("normalizes leading slashes without changing stable keys", () => {
    expect(normalizeStorageKey("/public/image.jpg")).toBe("public/image.jpg");
    expect(getPublicMediaUrl("public/Kwantu mark.svg")).toBe(
      "/media/public/Kwantu%20mark.svg"
    );
  });

  it.each(["", "../secret", "public/../secret", "public//image.jpg", "public\\image.jpg"])(
    "rejects unsafe key %s",
    key => {
      expect(() => normalizeStorageKey(key)).toThrow("Invalid object storage key");
    }
  );

  it("does not generate public URLs for private objects", () => {
    expect(() => getPublicMediaUrl("private/verification/document.pdf")).toThrow(
      "Only public objects can be rendered as media URLs"
    );
  });
});
