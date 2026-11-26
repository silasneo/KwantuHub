export function marketplaceFilterUrl(search: string, key: string, value: string, resetPage = true): string {
  const params = new URLSearchParams(search);
  if (value) params.set(key, value); else params.delete(key);
  if (resetPage) params.delete("page");
  const query = params.toString();
  return `/marketplace${query ? `?${query}` : ""}`;
}

export function dashboardLinkState<T extends string>(search: string, tabs: readonly T[], fallback: T) {
  const params = new URLSearchParams(search);
  const requested = params.get("tab");
  const rawInquiry = params.get("inquiry");
  const inquiry = rawInquiry && /^[1-9]\d*$/.test(rawInquiry) ? Number(rawInquiry) : null;
  return {
    activeTab: tabs.includes(requested as T) ? requested as T : fallback,
    inquiryId: inquiry != null && Number.isSafeInteger(inquiry) ? inquiry : null,
  };
}
