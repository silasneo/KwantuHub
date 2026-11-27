import { useEffect, useRef, useState } from "react";
import { mountTurnstileWidget, type TurnstileApi } from "@/lib/turnstile";

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export const turnstileConfigured = Boolean(siteKey);

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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let disposed = false;
    let removeWidget: (() => void) | undefined;
    const render = () => {
      if (disposed || removeWidget || !containerRef.current || !window.turnstile) return;
      removeWidget = mountTurnstileWidget(window.turnstile, containerRef.current, siteKey, action, onToken);
    };
    const failed = () => { if (!disposed) { setLoadError(true); onToken(undefined); } };
    let script = document.querySelector<HTMLScriptElement>('script[data-kwantu-turnstile="true"]');
    if (window.turnstile) render();
    else {
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.kwantuTurnstile = "true";
        script.addEventListener("load", render);
        script.addEventListener("error", failed);
        document.head.appendChild(script);
      } else {
        script.addEventListener("load", render);
        script.addEventListener("error", failed);
      }
    }
    return () => {
      disposed = true;
      script?.removeEventListener("load", render);
      script?.removeEventListener("error", failed);
      if (removeWidget) removeWidget(); else onToken(undefined);
    };
  }, [action, onToken]);

  if (!siteKey) return null;
  return <><div ref={containerRef} className="my-3 min-h-[65px]" aria-label="Bot protection" />
    {loadError && <p role="alert" className="form-error">Bot protection could not load. Check your connection or content blocker, then reload this page and try again.</p>}</>;
}
