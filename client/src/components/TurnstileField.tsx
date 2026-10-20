import { useEffect, useRef } from "react";

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

type TurnstileApi = {
  render: (element: HTMLElement, options: { sitekey: string; action?: string; callback?: (token: string) => void; "expired-callback"?: () => void; "error-callback"?: () => void }) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function TurnstileField({
  action,
  onToken,
}: {
  action: string;
  onToken: (token: string | undefined) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    const render = () => {
      if (!containerRef.current || !window.turnstile) return;
      containerRef.current.replaceChildren();
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: token => onToken(token),
        "expired-callback": () => onToken(undefined),
        "error-callback": () => onToken(undefined),
      });
    };
    if (window.turnstile) render();
    else {
      const existing = document.querySelector('script[data-kwantu-turnstile="true"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.kwantuTurnstile = "true";
        script.addEventListener("load", render);
        document.head.appendChild(script);
      } else existing.addEventListener("load", render);
    }
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      onToken(undefined);
    };
  }, [action, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="my-3 min-h-[65px]" aria-label="Bot protection" />;
}
