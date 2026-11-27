export function mediaUrl(value?: string | null): string {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  let key = value;
  if (key.startsWith("/manus-storage/")) {
    key = `public/${key.slice("/manus-storage/".length)}`;
  } else if (key.startsWith("/media/")) {
    key = key.slice("/media/".length);
  }

  const segments = key.replace(/^\/+/, "").split("/");
  if (
    !segments[0] ||
    segments.some(segment => !segment || segment === "." || segment === ".." || segment.includes("\\"))
  ) {
    return "";
  }
  if (segments[0] !== "public") return "";
  return `/media/${segments.map(encodeURIComponent).join("/")}`;
}
