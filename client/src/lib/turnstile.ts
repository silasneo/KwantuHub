export type TurnstileOptions = {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};
export type TurnstileApi = {
  render: (element: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
};

export function mountTurnstileWidget(api: TurnstileApi, element: HTMLElement, sitekey: string, action: string, onToken: (token: string | undefined) => void) {
  let active = true;
  const emit = (token: string | undefined) => { if (active) onToken(token); };
  const id = api.render(element, {
    sitekey, action,
    callback: emit,
    "expired-callback": () => emit(undefined),
    "error-callback": () => emit(undefined),
  });
  return () => {
    active = false;
    api.remove(id);
    onToken(undefined);
  };
}
