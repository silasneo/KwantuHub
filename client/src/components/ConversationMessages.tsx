import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function ConversationMessages({
  inquiryId,
  viewerId,
  otherName,
}: {
  inquiryId: number;
  viewerId: number;
  otherName: string;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = trpc.buyer.messages.useQuery(
    { inquiryId, page, pageSize: 30 },
    { enabled: open }
  );
  return (
    <div className="mb-6 space-y-3">
      <button
        type="button"
        className="border rounded px-3 py-2 text-sm"
        aria-expanded={open}
        aria-controls={`messages-${inquiryId}`}
        onClick={() => setOpen(value => !value)}
      >
        {open ? "Hide messages" : "Read conversation"}
      </button>
      {open && (
        <div id={`messages-${inquiryId}`} className="space-y-3">
          {query.isLoading && <p role="status">Loading messages...</p>}
          {query.error && (
            <p role="alert">
              {query.error.message}{" "}
              <button type="button" onClick={() => query.refetch()}>
                Retry
              </button>
            </p>
          )}
          {query.data && (
            <>
              <div className="flex justify-between items-center gap-3 text-sm">
                <button
                  type="button"
                  disabled={page >= query.data.pagination.totalPages}
                  onClick={() => setPage(value => value + 1)}
                >
                  Older messages
                </button>
                <span aria-live="polite">
                  Newest-first page {page} of {query.data.pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(value => value - 1)}
                >
                  Newer messages
                </button>
              </div>
              {query.data.items.length === 0 && <p>No visible messages.</p>}
              {query.data.items.map(message => (
                <div
                  key={message.id}
                  className={`p-3 rounded text-sm max-w-xl border border-[#eee8df] ${message.senderId === viewerId ? "ml-auto text-right bg-[#faf6f0]" : "mr-auto bg-[#fff7ed]"}`}
                >
                  <span className="text-xs font-bold">
                    {message.senderId === viewerId ? "You" : otherName}
                  </span>
                  <p className="font-serif whitespace-pre-wrap">
                    {message.body}
                  </p>
                  <time
                    className="text-xs text-[#68635c]"
                    dateTime={new Date(message.createdAt).toISOString()}
                  >
                    {new Date(message.createdAt).toLocaleString()}
                  </time>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
