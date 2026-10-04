import { describe, expect, it } from 'vitest';
import { parseRealtimeEvent, routesFor, SseParser } from './realtime.js';

describe('SseParser', () => {
  it('splits messages across chunks and skips comments', () => {
    const p = new SseParser();
    expect(p.push('retry: 5000\nevent: ready\ndata: {}\n\n: ping\n\ndata: {"a"')).toEqual([
      { event: 'ready', data: '{}' },
    ]);
    expect(p.push(':1}\n\n')).toEqual([{ event: 'message', data: '{"a":1}' }]);
    expect(p.push('data: x\r\ndata: y\r\n\r\n')).toEqual([{ event: 'message', data: 'x\ny' }]);
  });
});

describe('realtime events', () => {
  it('parses valid events and ignores the rest', () => {
    expect(parseRealtimeEvent('{"type":"notifications_read"}')).toEqual({
      type: 'notifications_read',
    });
    expect(parseRealtimeEvent('{"type":"unknown"}')).toBeNull();
    expect(parseRealtimeEvent('not json')).toBeNull();
  });

  it('maps each event to the queries it makes stale', () => {
    expect(routesFor({ type: 'notifications_read' })).toEqual(['unreadCount', 'listNotifications']);
    expect(
      routesFor({ type: 'notification', notification_type: 'share_received', share_id: null }),
    ).toEqual(expect.arrayContaining(['unreadCount', 'getFeed', 'getInbox']));
    expect(
      routesFor({ type: 'notification', notification_type: 'reply_received', share_id: null }),
    ).toEqual(expect.arrayContaining(['getShare', 'listReplies']));
  });
});
