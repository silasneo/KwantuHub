import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

interface ContactRevealProps {
  listingId: number;
}

function getAnonymousSessionId() {
  if (typeof window === "undefined") return undefined;
  const key = "kwantuhub_anonymous_session";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(key, value);
  return value;
}

export default function ContactReveal({ listingId }: ContactRevealProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>();
  const reveal = trpc.marketplace.revealContact.useMutation({
    onSuccess: () => setRevealed(true),
  });

  useEffect(() => setSessionId(getAnonymousSessionId()), []);

  const channels = useMemo(() => reveal.data?.channels || [], [reveal.data]);
  const labelFor = (type: string) =>
    ({
      phone: "Phone",
      whatsapp: "WhatsApp",
      imessage: "iMessage",
      instagram: "Instagram",
      contactEmail: "Email",
    })[type] || type;

  const copy = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section className="contact-reveal" aria-live="polite">
      <div className="contact-reveal__head">
        <div>
          <p className="eyebrow">Direct connection</p>
          <h2>Connect with this vendor</h2>
          <p>Reveal the contact channels the vendor has chosen to share.</p>
        </div>
        {!revealed && (
          <button
            type="button"
            className="brand-button contact-reveal__button"
            onClick={() =>
              reveal.mutate({ listingId, anonymousSessionId: sessionId })
            }
            disabled={reveal.isPending}
          >
            {reveal.isPending ? "Revealing…" : "Show contact"}
          </button>
        )}
      </div>

      {revealed && channels.length > 0 && (
        <div className="contact-reveal__channels">
          {channels.map(channel => (
            <div
              className="contact-channel"
              key={`${channel.type}-${channel.value}`}
            >
              <div>
                <span className="contact-channel__label">
                  {labelFor(channel.type)}
                </span>
                <strong>{channel.value}</strong>
              </div>
              <button type="button" onClick={() => copy(String(channel.value))}>
                {copied === String(channel.value) ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      )}

      {revealed && channels.length === 0 && (
        <p className="contact-reveal__empty">
          This vendor has not configured a public contact channel yet. You can
          still send an inquiry below.
        </p>
      )}

      {reveal.error && <p className="form-error">{reveal.error.message}</p>}
    </section>
  );
}
