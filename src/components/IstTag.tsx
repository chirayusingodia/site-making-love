import { useEffect, useState } from "react";

/**
 * Renders " (IST)" when the viewer's browser time zone isn't India's.
 * Pooja times are shown as-is (never converted) — the pooja happens in
 * India. Client-only decision (after mount) so SSR and hydration agree.
 */
export function IstTag() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setShow(!!tz && tz !== "Asia/Kolkata" && tz !== "Asia/Calcutta");
    } catch {
      setShow(false);
    }
  }, []);
  return show ? <span> (IST)</span> : null;
}
