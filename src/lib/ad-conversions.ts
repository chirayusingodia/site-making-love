// Fires the one conversion event ad platforms actually optimize toward —
// a completed subscription. No-ops if the corresponding pixel/tag was
// never loaded (no env var set — see __root.tsx), so this is always safe
// to call regardless of whether ads are running yet.

interface FbqFn {
  (command: "track", event: string, params?: Record<string, unknown>): void;
}
interface GtagFn {
  (command: "event", eventName: string, params?: Record<string, unknown>): void;
}
declare global {
  interface Window {
    fbq?: FbqFn;
    gtag?: GtagFn;
  }
}

export function fireSubscribeConversion(params: { valuePaise: number; planName?: string }): void {
  if (typeof window === "undefined") return;
  const value = Math.round(params.valuePaise) / 100;
  try {
    window.fbq?.("track", "Subscribe", { value, currency: "INR" });
  } catch {
    // never let a blocked/missing pixel break the success page
  }
  try {
    window.gtag?.("event", "subscribe", {
      value,
      currency: "INR",
      ...(params.planName ? { plan_name: params.planName } : {}),
    });
  } catch {
    // same — analytics failures must stay silent to the user
  }
}
