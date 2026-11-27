import { useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { mediaUrl } from "@/lib/storage";

export function VendorImageUpload({ label, value, onChange, max = 1, disabled = false, onBusy }: {
  label: string; value: string[]; onChange: (urls: string[]) => void; max?: number; disabled?: boolean; onBusy?: (busy: boolean) => void;
}) {
  const id = useId();
  const [error, setError] = useState("");
  const upload = trpc.vendor.uploadImage.useMutation();
  const discard = trpc.vendor.discardImage.useMutation();
  return <fieldset disabled={disabled || upload.isPending} className="space-y-3">
    <legend className="text-xs font-bold uppercase">{label}</legend>
    <p id={`${id}-help`} className="text-xs text-[#68635c]">JPEG, PNG or WebP, up to 5 MB and 25 megapixels. No animated images. {max > 1 ? `Up to ${max} images; first is the cover.` : ""}</p>
    <div className="flex flex-wrap gap-3">
      {value.map((url, index) => <div key={`${url}-${index}`} className="space-y-1">
        <img src={mediaUrl(url)} alt={`${label} ${index + 1}`} className="h-24 w-24 rounded object-cover" />
        <button type="button" className="text-xs underline" onClick={() => {
          onChange(value.filter((_, i) => i !== index));
          discard.mutate({ url });
        }}>Remove image {index + 1}</button>
        {max > 1 && index > 0 && <button type="button" className="block text-xs underline" onClick={() => {
          const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next);
        }}>Move earlier</button>}
      </div>)}
    </div>
    <label htmlFor={id} className="block text-xs">{upload.isPending ? "Uploading image…" : "Upload image"}</label>
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={`${id}-help`}
      disabled={disabled || upload.isPending || value.length >= max}
      onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setError("");
        if (file.size > 5 * 1024 * 1024) { setError("Choose an image 5 MB or smaller."); return; }
        onBusy?.(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Image could not be read."));
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.readAsDataURL(file);
          });
          const result = await upload.mutateAsync({ fileBase64: base64 });
          onChange([...value, result.url]);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Image upload failed. Please retry."); }
        finally { onBusy?.(false); }
      }} />
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {discard.error && <p role="alert" className="text-xs text-red-700">{discard.error.message}</p>}
  </fieldset>;
}
