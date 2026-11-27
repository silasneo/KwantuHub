import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function PhoneCountrySettings() {
  const settings = trpc.admin.phoneCountries.useQuery();
  const [country, setCountry] = useState("");
  const utils = trpc.useUtils();
  const save = trpc.admin.setPhoneCountry.useMutation({
    onSuccess: async () => {
      setCountry("");
      await utils.admin.phoneCountries.invalidate();
      await utils.auth.phoneCountries.invalidate();
    },
  });
  const error = settings.error || save.error;
  return <section className="bg-white border border-[#d9d0c4] rounded p-6 space-y-4">
    <h2 className="font-serif text-2xl">SMS and identity verification countries</h2>
    <p className="text-sm">Checked countries appear in the phone-verification selector and the vendor identity (Step 2) Country field, and can receive new OTP requests and identity submissions. Unchecking hides and disables new verifications; it does not revoke previously verified phones or saved identities. Enable each destination in your SMS provider too.</p>
    {settings.isLoading && <p>Loading country settings...</p>}
    {settings.data?.configured.map(item => <label className="flex gap-3 items-center" key={item.countryCode}>
      <input type="checkbox" checked={item.enabled} disabled={save.isPending}
        onChange={event => save.mutate({ countryCode: item.countryCode, enabled: event.target.checked })} />
      {item.name} ({item.callingCode}) - {item.enabled ? "Enabled" : "Disabled / hidden"}
    </label>)}
    <form className="flex flex-wrap gap-3" onSubmit={event => {
      event.preventDefault();
      if (country) save.mutate({ countryCode: country, enabled: true });
    }}>
      <label>Add a country
        <select className="border rounded p-2 ml-2" required value={country} onChange={event => setCountry(event.target.value)}>
          <option value="">Select country</option>
          {settings.data?.available.filter(item => !settings.data.configured.some(existing => existing.countryCode === item.countryCode))
            .map(item => <option key={item.countryCode} value={item.countryCode}>{item.name} ({item.callingCode})</option>)}
        </select>
      </label>
      <button className="brand-button" disabled={!country || save.isPending}>Add / enable country</button>
    </form>
    {error && <p role="alert" className="form-error">{error.message}</p>}
    {save.isSuccess && <p role="status">Country settings saved.</p>}
  </section>;
}
