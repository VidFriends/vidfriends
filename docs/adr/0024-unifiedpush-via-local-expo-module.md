# ADR-0024: UnifiedPush on Android through a local Expo module

- **Status:** Accepted
- **Date:** 2026-10-05
- **Decided by:** Owner scheduled UnifiedPush (multiple-choice answer, 2026-10-04).
  Mechanism: Claude under delegation.
- **Supersedes:** item 6 of [ADR-0020](0020-ntfy-and-gotify-push-channels.md) ("UnifiedPush is
  deferred"). The rest of ADR-0020 stands.

## Context

- The app's push uses Expo Push, which relays through Google (FCM) on Android and needs the build's
  EAS project id. Sideloaded builds (M6-T8) have none, so they get no push at all, and
  de-Googled phones cannot receive FCM.
- UnifiedPush lets an app receive pushes through a distributor app the member already runs (for
  example ntfy, which can use their own server). The distributor hands the app an endpoint URL. The
  app server POSTs RFC 8291 Web Push messages to that URL, and the distributor passes them to the
  app, where the connector library decrypts them.
- Using UnifiedPush needs the Android connector library (`org.unifiedpush.android:connector`) and
  an Android service that receives its events. ADR-0020 deferred it for that reason. Expo SDK 57
  supports **local Expo modules**: native code in the app repository that is autolinked into
  prebuild, with no ejecting.

## Decision

1. **A local Expo module** `apps/mobile/modules/vidfriends-unifiedpush` (Kotlin, Android only):
   - It uses connector 3.0.x, which handles distributor discovery, the Web Push key pair and
     decryption.
   - It exposes `getDistributors`, `getDistributor`, `getEndpoint`, `register(distributor, vapid)`
     and `unregister`, plus events for new endpoints, unregistration and failure.
   - `VidFriendsPushService` stores the endpoint and shows each decrypted message itself, so pushes
     work while the app is closed. It shows only the generic title (BR-NOT-3), and a tap opens the
     in-app path through the app's `vidfriends://` links.
   - On iOS and in tests the module is absent and the card does not show.
2. **A new push target kind `unifiedpush`:** the distributor's endpoint plus the Web Push keys
   (`p256dh`, `auth`).
   - The server sends Web Push (aes128gcm) with the instance VAPID key.
   - The URL is user input, so the request goes through ADR-0020's egress guard: https to public
     addresses, or hosts listed in `PUSH_PRIVATE_HOSTS`, with the address pinned.
   - 404 and 410 delete the target (BR-NOT-6). One row per endpoint, and up to 5 per member.
3. **One push channel per phone:** turning UnifiedPush on turns Expo push off for that phone, and
   the reverse. Signing out unregisters.
4. **Settings → UnifiedPush** lists installed distributors (or explains that none is installed),
   registers with the chosen one, and offers to turn it off.

## Alternatives considered

| Option | Why not |
|---|---|
| Eject from Expo / a bare React Native app | Gives up managed prebuild for one feature; a local module keeps the Expo workflow (ADR-0017). |
| A third-party React Native UnifiedPush package | None was maintained for the current connector API and Expo SDK; our module is about 200 lines. |
| Members use the ntfy app with an ntfy target (ADR-0020) | Still available, but it shows ntfy notifications, not the app's, and taps do not open the share. |

## Consequences

- Native code to maintain: the Android CI build compiles it, and the Maestro flow checks that the
  card renders (no distributor in the emulator).
- End-to-end delivery through a real distributor (ntfy) is a manual check on a phone, recorded in
  the roadmap as owner verification, like passkeys (M7-T6).
- The distributor's server sees only encrypted payloads and the timing of pushes.

## Revisit when

- Expo or React Native gains first-party UnifiedPush support, or iOS gains an equivalent.
