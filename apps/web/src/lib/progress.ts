// Progress beacons (TDD §4): `fetch` with keepalive so the last report survives page hides.
// (navigator.sendBeacon cannot carry the CSRF header that cookie-authenticated POSTs need.)
import { readCookie } from '@vidfriends/api-client';
import { API_PREFIX } from '@vidfriends/contracts';

export function reportProgress(
  shareId: string,
  body: { position_ms: number; duration_ms?: number; opened_original?: boolean },
) {
  const csrf = readCookie('vf_csrf');
  return fetch(`${API_PREFIX}/shares/${encodeURIComponent(shareId)}/progress`, {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
