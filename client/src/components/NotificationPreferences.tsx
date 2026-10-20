import { useEffect, useState, type ChangeEvent } from "react";
import { trpc } from "@/lib/trpc";

export function NotificationPreferences() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.notifications.getPreferences.useQuery();
  const [form, setForm] = useState({
    inAppEnabled: true,
    emailInquiries: true,
    emailReplies: true,
    emailResolutions: false,
    emailAccount: true,
    timezone: "",
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      inAppEnabled: data.inAppEnabled,
      emailInquiries: data.emailInquiries,
      emailReplies: data.emailReplies,
      emailResolutions: data.emailResolutions,
      emailAccount: data.emailAccount,
      timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, [data]);

  const update = trpc.notifications.updatePreferences.useMutation({
    onSuccess: next => {
      setForm(current => ({ ...current, ...next, timezone: next.timezone || current.timezone }));
      utils.notifications.getPreferences.invalidate();
    },
  });

  const setBoolean = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm(current => ({ ...current, [key]: event.target.checked }));
  };

  if (isLoading) return <p className="font-serif text-sm text-[#68635c]">Loading notification preferences...</p>;

  const rows: Array<[keyof typeof form, string]> = [
    ["inAppEnabled", "Show in-app notifications"],
    ["emailInquiries", "Email me about new inquiries"],
    ["emailReplies", "Email me when someone replies"],
    ["emailResolutions", "Email me when an inquiry is resolved"],
    ["emailAccount", "Email me about account updates"],
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3 font-serif text-sm text-[#333]">
        {rows.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-4 border-b border-[#eee8df] pb-3">
            <span>{label}</span>
            <input type="checkbox" checked={Boolean(form[key])} onChange={setBoolean(key)} />
          </label>
        ))}
      </div>
      <label className="block font-serif text-sm text-[#333]">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#68635c]">Display timezone</span>
        <input
          value={form.timezone}
          onChange={event => setForm(current => ({ ...current, timezone: event.target.value }))}
          placeholder="America/Toronto"
          className="w-full rounded border border-[#d9d0c4] bg-[#faf6f0] px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-[#888]">Use an IANA timezone such as America/Toronto or America/Los_Angeles.</span>
      </label>
      <button
        type="button"
        onClick={() => update.mutate(form)}
        disabled={update.isPending}
        className="rounded brand-gradient px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
      >
        {update.isPending ? "Saving…" : "Save notification settings"}
      </button>
    </div>
  );
}
