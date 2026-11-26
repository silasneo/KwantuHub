import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { dashboardLinkState } from "@shared/discoveryNavigation";

export function useDashboardTab<T extends string>(tabs: readonly T[], fallback: T, ready?: unknown) {
  const search = useSearch();
  const [path, navigate] = useLocation();
  const { activeTab, inquiryId } = dashboardLinkState(search, tabs, fallback);
  const setActiveTab = (tab: T) => {
    const next = new URLSearchParams(search);
    next.set("tab", tab);
    next.delete("inquiry");
    navigate(`${path}?${next.toString()}`);
  };
  useEffect(() => {
    if (!inquiryId) return;
    const focus = () => {
      const target = document.getElementById(`inquiry-${inquiryId}`);
      if (!target) return false;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
      return true;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => { if (focus()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeTab, inquiryId, ready]);
  return { activeTab, setActiveTab, inquiryId };
}
