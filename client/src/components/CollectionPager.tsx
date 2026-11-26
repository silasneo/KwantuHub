import { useEffect } from "react";

type Props = {
  pagination?: { page: number; total: number; totalPages: number };
  onPage: (page: number) => void;
  label: string;
};

export function CollectionPager({ pagination, onPage, label }: Props) {
  const page = pagination?.page;
  const totalPages = pagination?.totalPages;
  useEffect(() => {
    if (page && totalPages && page > totalPages) onPage(totalPages);
  }, [page, totalPages, onPage]);
  if (!pagination) return null;
  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex items-center justify-between gap-3 my-4 text-sm"
    >
      <button
        type="button"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
        className="border rounded px-3 py-2 disabled:opacity-40"
      >
        Previous
      </button>
      <span aria-live="polite">
        Page {pagination.page} of {pagination.totalPages} · {pagination.total}{" "}
        total
      </span>
      <button
        type="button"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPage(pagination.page + 1)}
        className="border rounded px-3 py-2 disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}
