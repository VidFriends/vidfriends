// Realtime client helpers (FR-NOTIF-06, ADR-0019), shared by the web app and the mobile app:
// which cached queries an event makes stale, and a parser for the `text/event-stream` body.
import {
  getFeed,
  getInbox,
  getSent,
  getShare,
  listFriendRequests,
  listFriends,
  listNotifications,
  listReplies,
  RealtimeEvent,
  unreadCount,
} from '@vidfriends/contracts';

/** Route ids whose queries an event makes stale; invalidate each with `[id]`. */
export function routesFor(event: RealtimeEvent): string[] {
  const ids = [unreadCount.id, listNotifications.id];
  if (event.type !== 'notification') return ids;
  switch (event.notification_type) {
    case 'share_received':
      return [...ids, getFeed.id, getInbox.id];
    case 'reaction_received':
    case 'reply_received':
      return [...ids, getShare.id, listReplies.id, getSent.id, getInbox.id];
    case 'share_watched':
      return [...ids, getShare.id, getSent.id];
    case 'friend_request_received':
      return [...ids, listFriendRequests.id];
    case 'friend_request_accepted':
      return [...ids, listFriends.id, listFriendRequests.id];
  }
}

export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental `text/event-stream` parser (comments and unknown fields ignored). */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseMessage[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const out: SseMessage[] = [];
    let cut: number;
    while ((cut = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const i = line.indexOf(':');
        const field = i < 0 ? line : line.slice(0, i);
        const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length || event !== 'message') out.push({ event, data: data.join('\n') });
    }
    return out;
  }
}

/** Parses a `data` payload; unknown or malformed events are ignored (null). */
export function parseRealtimeEvent(data: string): RealtimeEvent | null {
  try {
    const parsed = RealtimeEvent.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
