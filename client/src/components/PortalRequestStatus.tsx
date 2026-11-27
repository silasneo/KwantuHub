import type { ReactNode } from "react";

type RequestState = { error?: { message: string } | null; isLoading?: boolean; isPending?: boolean; isSuccess?: boolean };
export function PortalRequestStatus({ queries = [], mutations = [], onRetry, children }: {
  queries?: RequestState[];
  mutations?: RequestState[];
  onRetry: () => void;
  children?: ReactNode;
}) {
  const errors = Array.from(new Set([...queries, ...mutations].flatMap(request => request.error ? [request.error.message] : [])));
  if (errors.length) return <div role="alert" className="mb-5 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
    <p className="font-bold">Some information or changes could not be loaded or saved.</p>
    {errors.map(message => <p key={message}>{message}</p>)}
    <button type="button" className="underline mt-2" onClick={onRetry}>Retry loading</button>
    {children}
  </div>;
  if (queries.some(query => query.isLoading)) return <p role="status" className="mb-4">Loading workspace information…</p>;
  if (mutations.some(mutation => mutation.isPending)) return <p role="status" className="mb-4">Saving changes…</p>;
  if (mutations.some(mutation => mutation.isSuccess)) return <p role="status" className="mb-4">Your latest completed action was saved.</p>;
  return null;
}
