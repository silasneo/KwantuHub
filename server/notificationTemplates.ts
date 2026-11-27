import { ENV } from "./_core/env";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/**
 * Converts an in-app path into an absolute APP_URL link for email. Only same-origin
 * paths are accepted so a payload can never turn an email into an open redirect.
 */
export function absoluteAppUrl(path: unknown, appUrl = ENV.appUrl): string | null {
  if (typeof path !== "string" || !path.trim()) return null;
  let origin: URL;
  try { origin = new URL(appUrl); } catch { return null; }
  const value = path.trim();
  try {
    if (/^https?:\/\//i.test(value)) {
      const parsed = new URL(value);
      return parsed.origin === origin.origin ? parsed.toString() : null;
    }
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
    const resolved = new URL(value, origin);
    return resolved.origin === origin.origin ? resolved.toString() : null;
  } catch {
    return null;
  }
}

export type EmailLink = { label: string; url: string };

export type RenderedEmail = { subject: string; text: string; html: string };

export function renderTransactionalEmail(input: {
  title: string;
  body: string;
  actionUrl?: unknown;
  actionLabel?: string;
  items?: { title: string; url?: unknown }[];
  footer?: string;
  appUrl?: string;
}): RenderedEmail {
  const appUrl = input.appUrl ?? ENV.appUrl;
  const action = absoluteAppUrl(input.actionUrl, appUrl);
  const items = (input.items ?? []).map(item => ({ title: item.title, url: absoluteAppUrl(item.url, appUrl) }));
  const footer = input.footer ?? "You received this email because of activity on your KwantuHub account. Manage email preferences in your KwantuHub account settings.";
  const preferencesUrl = absoluteAppUrl("/profile", appUrl);
  const text = [
    input.body,
    ...items.map(item => `- ${item.title}${item.url ? `: ${item.url}` : ""}`),
    action ? `${input.actionLabel ?? "View in KwantuHub"}: ${action}` : "",
    footer,
    preferencesUrl ? `Email preferences: ${preferencesUrl}` : "",
  ].filter(Boolean).join("\n\n");
  const html = [
    `<p>${escapeHtml(input.body)}</p>`,
    items.length
      ? `<ul>${items.map(item => item.url
        ? `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></li>`
        : `<li>${escapeHtml(item.title)}</li>`).join("")}</ul>`
      : "",
    action ? `<p><a href="${escapeHtml(action)}">${escapeHtml(input.actionLabel ?? "View in KwantuHub")}</a></p>` : "",
    `<p style="color:#666;font-size:12px">${escapeHtml(footer)}${preferencesUrl
      ? ` <a href="${escapeHtml(preferencesUrl)}">Email preferences</a>` : ""}</p>`,
  ].join("");
  return { subject: input.title, text, html };
}
