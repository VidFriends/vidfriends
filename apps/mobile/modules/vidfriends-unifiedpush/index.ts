// UnifiedPush for VidFriends (ADR-0024). Android only: elsewhere (iOS, tests) the native module is
// absent and `available` is false.
import { requireOptionalNativeModule } from 'expo';

export interface EventSubscription {
  remove(): void;
}

export interface Distributor {
  /** Package name of the distributor app. */
  id: string;
  name: string;
}

export interface Endpoint {
  url: string;
  p256dh: string;
  auth: string;
}

interface NativeModule {
  getDistributors(): Distributor[];
  getDistributor(): string | null;
  getEndpoint(): Endpoint | null;
  register(distributor: string, vapid: string): void;
  unregister(): void;
  addListener(event: 'onNewEndpoint', listener: (e: Endpoint) => void): EventSubscription;
  addListener(event: 'onUnregistered', listener: () => void): EventSubscription;
  addListener(
    event: 'onRegistrationFailed',
    listener: (e: { reason: string }) => void,
  ): EventSubscription;
}

const native = requireOptionalNativeModule<NativeModule>('VidFriendsUnifiedPush');

export const available = native !== null;

export function getDistributors(): Distributor[] {
  return native?.getDistributors() ?? [];
}

export function getDistributor(): string | null {
  return native?.getDistributor() ?? null;
}

export function getEndpoint(): Endpoint | null {
  return native?.getEndpoint() ?? null;
}

export function register(distributor: string, vapid: string): void {
  native?.register(distributor, vapid);
}

export function unregister(): void {
  native?.unregister();
}

export function addEndpointListener(listener: (e: Endpoint) => void): EventSubscription | null {
  return native?.addListener('onNewEndpoint', listener) ?? null;
}

export function addUnregisteredListener(listener: () => void): EventSubscription | null {
  return native?.addListener('onUnregistered', listener) ?? null;
}

export function addFailedListener(
  listener: (e: { reason: string }) => void,
): EventSubscription | null {
  return native?.addListener('onRegistrationFailed', listener) ?? null;
}
