# ADR-0004: Mobile clients with Expo (React Native) instead of separate native apps

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Owner, accepting Claude's recommendation on 2026-10-03.

## Context

The 2026 restarts built four native mobile codebases across three repositories:

- `vidfriends-ios` (SwiftUI)
- `VidFriends-iOS-Android` (one SwiftUI app and one Kotlin/Compose app)
- `vidfriends-android` (a second Compose re-scaffold)

Each one re-implemented auth, models and API calls. They spoke two incompatible API dialects, and the audit found evidence that none of them built cleanly (see the [legacy audit](../legacy/AUDIT.md)). The product's central mobile action is **sharing a video link from another app into VidFriends** through the OS share sheet. A web app on iOS cannot receive shares, and Android web apps can only receive them partially, as a PWA.

## Decision

- Use one Expo (React Native, TypeScript) app for iOS and Android, located at `apps/mobile`.
- Share `packages/contracts` (Zod schemas and the generated API client) and the TanStack Query hooks with the web app.
- Receive OS shares with a share-extension or share-intent config plugin (for example `expo-share-intent`). Use development builds, not Expo Go.
- Mobile ships **after** the web MVP (see the [roadmap](../ROADMAP.md), M4). The API is designed for mobile from M1: token auth and push-ready.

## Alternatives considered

- **Native Swift and Kotlin apps.** Rejected: that means three UI codebases for a small team, and it is how the earlier restarts fragmented.
- **PWA only.** Rejected as the end state, because iOS share-sheet support is missing. A PWA is still the interim mobile experience.
- **Capacitor wrapping the web app.** A credible alternative. Rejected because share extensions and native video players are less mature there.

## Consequences

- Components are not shared directly with the web app: shadcn/ui is DOM-only. Logic, types, and API hooks are shared.
- An Apple Developer and Google Play account are needed by M4. This is a business prerequisite, recorded in the BRD.

## Revisit when

Share-extension support in Expo turns out to be unworkable, or a feature needs heavy native video work.
