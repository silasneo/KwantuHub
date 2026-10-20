import { useState } from "react";
import { trpc } from "@/lib/trpc";

function formatNotificationDate(value: Date | string | number) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type NotificationCenterProps = {
  mode?: "popover" | "panel";
};

export function NotificationCenter({ mode = "popover" }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.notifications.list.useQuery(
    { limit: mode === "panel" ? 20 : 5 },
    { refetchInterval: 30_000 }
  );
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const content = (
    <div className={mode === "panel" ? "bg-white border border-[#d9d0c4] rounded shadow-xs" : "w-[min(22rem,calc(100vw-2rem))] bg-white border border-[#d9d0c4] rounded shadow-xl"}>
      <div className="flex items-center justify-between gap-4 border-b border-[#eee8df] px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d71466]">Your updates</p>
          <h2 className="font-serif text-lg font-bold text-[#0a0a0a]">Notifications</h2>
        </div>
        {(data?.unreadCount || 0) > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate({})}
            disabled={markAllRead.isPending}
            className="text-[10px] font-bold uppercase tracking-wider text-[#d71466] hover:underline disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className={mode === "panel" ? "divide-y divide-[#eee8df]" : "max-h-[24rem] overflow-y-auto divide-y divide-[#eee8df]"}>
        {isLoading ? (
          <p className="px-4 py-8 text-center font-serif text-sm text-[#68635c]">Loading updates...</p>
        ) : !data?.items.length ? (
          <p className="px-4 py-8 text-center font-serif text-sm text-[#68635c]">You are all caught up.</p>
        ) : (
          data.items.map(item => (
            <div key={item.id} className={`px-4 py-3 transition ${item.readAt ? "bg-white" : "bg-[#fff7ed]"}`}>
              <div className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-[#d9d0c4]" : "bg-[#d71466]"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-sm font-bold text-[#0a0a0a]">{item.title}</p>
                  <p className="mt-1 font-serif text-sm leading-relaxed text-[#68635c]">{item.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-[10px] uppercase tracking-wider text-[#999]">{formatNotificationDate(item.createdAt)}</span>
                    {!item.readAt && (
                      <button
                        type="button"
                        onClick={() => markRead.mutate({ notificationId: item.id })}
                        className="text-[10px] font-bold uppercase tracking-wider text-[#d71466] hover:underline"
                      >
                        Mark read
                      </button>
                    )}
                    {item.actionUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.readAt) markRead.mutate({ notificationId: item.id });
                          window.location.href = item.actionUrl!;
                        }}
                        className="text-[10px] font-bold uppercase tracking-wider text-[#fe8129] hover:underline"
                      >
                        View details →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (mode === "panel") return content;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${data?.unreadCount ? `, ${data.unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#0a0a0a] transition hover:bg-[#faf6f0] hover:text-[#d71466]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {(data?.unreadCount || 0) > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d71466] px-1 text-[9px] font-bold text-white">
            {data!.unreadCount > 9 ? "9+" : data!.unreadCount}
          </span>
        )}
      </button>
      {open && <div className="absolute right-0 top-11 z-50">{content}</div>}
    </div>
  );
}
