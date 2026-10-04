// Push payloads carry only a web path and ids (BR-NOT-3); this maps them to app screens.
/** Maps `data.url` (the server's notify job `urlFor`) to an app screen. */
export function pushTarget(
  data: Record<string, unknown> | undefined,
): { kind: 'share'; id: string } | { kind: 'friends' | 'inbox' | 'notifications' } {
  const url = typeof data?.url === 'string' ? data.url : '';
  const share = /^\/shares\/([0-9a-f-]{36})$/i.exec(url);
  if (share) return { kind: 'share', id: share[1]! };
  if (url === '/friends') return { kind: 'friends' };
  if (url === '/inbox') return { kind: 'inbox' };
  return { kind: 'notifications' };
}
