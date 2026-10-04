// FR-NOTIF-03 / BR-NOT-3 / BR-NOT-6: Expo Push channel.
import { describe, expect, it, vi } from 'vitest';
import {
  createExpoPushSender,
  EXPO_PUSH_URL,
  type PushTargetRow,
} from '../src/infra/push/channels.js';

const target: PushTargetRow = {
  id: 't1',
  kind: 'expo',
  endpoint: 'ExponentPushToken[abcdefghij0123456789]',
  p256dh: null,
  auth: null,
};
const payload = {
  title: 'New video from Sam',
  data: { notification_id: 'n1', url: '/shares/s1' },
  tag: 'share_received',
};
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('Expo push sender', () => {
  it('posts only the generic title and opaque ids to the Expo endpoint', async () => {
    const f = reply(200, { data: { status: 'ok', id: 'r1' } });
    await expect(
      createExpoPushSender({ fetch: f, accessToken: 'expo-token-123' }).send(target, payload),
    ).resolves.toBe('ok');
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(EXPO_PUSH_URL);
    expect(init.headers.authorization).toBe('Bearer expo-token-123');
    expect(JSON.parse(init.body)).toMatchObject({
      to: target.endpoint,
      title: payload.title,
      data: payload.data,
    });
    expect(JSON.parse(init.body)).not.toHaveProperty('body');
  });

  it('reports unregistered devices and malformed tokens as gone, other failures as errors', async () => {
    const gone = reply(200, {
      data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    });
    await expect(createExpoPushSender({ fetch: gone }).send(target, payload)).resolves.toBe('gone');
    const never = vi.fn() as unknown as typeof fetch;
    await expect(
      createExpoPushSender({ fetch: never }).send(
        { ...target, endpoint: 'https://evil.example' },
        payload,
      ),
    ).resolves.toBe('gone');
    expect(never).not.toHaveBeenCalled();
    await expect(
      createExpoPushSender({ fetch: reply(503, {}) }).send(target, payload),
    ).resolves.toBe('error');
    const rate = reply(200, {
      data: { status: 'error', details: { error: 'MessageRateExceeded' } },
    });
    await expect(createExpoPushSender({ fetch: rate }).send(target, payload)).resolves.toBe(
      'error',
    );
  });
});
