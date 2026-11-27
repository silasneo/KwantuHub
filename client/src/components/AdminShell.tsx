import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "wouter";
import { ExternalLink, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { NotificationCenter } from "./NotificationCenter";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export type AdminNavItem<K extends string> = {
  key: K;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
};
export type AdminNavGroup<K extends string> = { title: string; items: AdminNavItem<K>[] };

const STORAGE_KEY = "kwantu-admin-sidebar-collapsed";

function NavList<K extends string>({ groups, active, collapsed, onSelect }: {
  groups: AdminNavGroup<K>[];
  active: K;
  collapsed: boolean;
  onSelect: (key: K) => void;
}) {
  return (
    <nav aria-label="Admin sections" className="flex-1 space-y-6 overflow-y-auto px-3 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {groups.map(group => (
        <div key={group.title}>
          {collapsed
            ? <div className="mx-auto mb-2 h-px w-6 bg-white/15" aria-hidden="true" />
            : <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{group.title}</p>}
          <ul className="space-y-0.5">
            {group.items.map(({ key, label, icon: Icon, badge }) => {
              const selected = key === active;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onSelect(key)}
                    aria-current={selected ? "page" : undefined}
                    title={collapsed ? label : undefined}
                    className={`relative flex w-full items-center gap-3 rounded-lg py-2.5 text-left text-sm transition ${collapsed ? "justify-center px-0" : "px-3"} ${selected ? "bg-white/10 font-semibold text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
                  >
                    {selected && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-[#d71466] to-[#fe8129]" aria-hidden="true" />}
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{label}</span>}
                    {!!badge && (collapsed
                      ? <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[#d71466]" aria-label={`${badge} pending`} />
                      : <span className="rounded-full bg-[#d71466] px-2 py-0.5 text-[10px] font-bold text-white">{badge}</span>)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const item = `flex w-full items-center gap-3 rounded-lg py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white ${collapsed ? "justify-center" : "px-3"}`;
  return (
    <div className="space-y-1 border-t border-white/10 px-3 py-4">
      <Link href="/" className={item} title={collapsed ? "View marketplace" : undefined}>
        <ExternalLink className="h-[18px] w-[18px] shrink-0" />{!collapsed && "View marketplace"}
      </Link>
      <button type="button" onClick={() => logout()} className={item} title={collapsed ? "Sign out" : undefined}>
        <LogOut className="h-[18px] w-[18px] shrink-0" />{!collapsed && "Sign out"}
      </button>
      {!collapsed && user && <p className="truncate px-3 pt-2 text-xs text-white/40">{user.email}</p>}
    </div>
  );
}

export function AdminShell<K extends string>({ groups, active, onSelect, children }: {
  groups: AdminNavGroup<K>[];
  active: K;
  onSelect: (key: K) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* storage unavailable */ }
  }, [collapsed]);
  const activeLabel = groups.flatMap(group => group.items).find(item => item.key === active)?.label ?? "Admin";
  const brand = (compact: boolean) => (
    <Link href="/admin" className={`flex items-center gap-2.5 ${compact ? "justify-center" : ""}`}>
      <img src="/media/public/Kwantu-identity_fc192da7.svg" alt="KwantuHub" className="h-8 w-8 shrink-0" />
      {!compact && <span className="leading-tight"><span className="block font-brand text-lg font-bold tracking-wider text-white">KwantuHub</span><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#fe8129]">Admin control room</span></span>}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-[#f5f1ea]">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-[#0a0a0a] transition-[width] duration-200 lg:flex ${collapsed ? "w-[72px]" : "w-64"}`}>
        <div className={`flex h-16 items-center border-b border-white/10 ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
          {brand(collapsed)}
        </div>
        <NavList groups={groups} active={active} collapsed={collapsed} onSelect={onSelect} />
        <SidebarFooter collapsed={collapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 border-0 bg-[#0a0a0a] p-0 text-white">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <SheetDescription className="sr-only">Choose an admin section</SheetDescription>
          <div className="flex h-16 items-center border-b border-white/10 px-5">{brand(false)}</div>
          <NavList groups={groups} active={active} collapsed={false} onSelect={key => { onSelect(key); setMobileOpen(false); }} />
          <SidebarFooter collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[#e4dcd0] bg-white/90 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#0a0a0a] hover:bg-[#f0e8dc] lg:hidden" aria-label="Open admin navigation">
            <Menu className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setCollapsed(value => !value)} className="hidden rounded-lg p-2 text-[#4b4843] hover:bg-[#f0e8dc] hover:text-[#0a0a0a] lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d71466]">Governance & trust</p>
            <h1 className="truncate font-serif text-lg font-bold text-[#0a0a0a]">{activeLabel}</h1>
          </div>
          <NotificationCenter />
        </header>
        <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
