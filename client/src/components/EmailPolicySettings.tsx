import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function EmailPolicySettings() {
  const status = trpc.admin.emailPolicy.useQuery();
  const [domain, setDomain] = useState("");
  const [policy, setPolicy] = useState<"allow" | "block" | "inherit">("block");
  const [reason, setReason] = useState("");
  const save = trpc.admin.setEmailDomainOverride.useMutation({ onSuccess: () => status.refetch() });
  const field = "w-full border rounded p-3";
  return <section className="space-y-5">
    <h2 className="font-serif text-3xl">Email screening</h2>
    <p>Local disposable-domain list with most-specific domain overrides. Overrides do not bypass DNS or ownership verification.</p>
    {status.isLoading && <p>Loading email policy...</p>}
    {status.data && <>
      <p className="text-sm">{status.data.metadata.count.toLocaleString()} domains; snapshot {status.data.metadata.updatedAt}; revision <code>{status.data.metadata.revision}</code>.</p>
      {status.data.stale && <p role="alert">Snapshot is over seven days old. An operator should review and deploy an updated snapshot.</p>}
      <form className="space-y-3 max-w-xl" onSubmit={event => { event.preventDefault(); save.mutate({ domain, policy, reason }); }}>
        <label className="block">Domain<input className={field} required placeholder="example.com" value={domain} onChange={event => setDomain(event.target.value)} /></label>
        <label className="block">Policy<select className={field} value={policy} onChange={event => setPolicy(event.target.value as typeof policy)}>
          <option value="block">Block</option><option value="allow">Allow despite disposable list</option><option value="inherit">Remove override / use list</option>
        </select></label>
        <label className="block">Audit reason<input className={field} required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button className="brand-button" disabled={save.isPending}>Save domain policy</button>
      </form>
      {save.isSuccess && <p role="status">Domain policy saved.</p>}
      <table className="w-full text-left"><thead><tr><th>Domain</th><th>Policy</th><th>Reason</th></tr></thead>
        <tbody>{status.data.overrides.map(row => <tr key={row.domain}><td>{row.domain}</td><td>{row.policy}</td><td>{row.reason}</td></tr>)}</tbody></table>
    </>}
    {(status.error || save.error) && <p role="alert" className="form-error">{status.error?.message || save.error?.message}</p>}
  </section>;
}
