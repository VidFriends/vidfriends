# VidFriends mobile (Expo)

The iOS and Android app ([ADR-0004](../../docs/adr/0004-mobile-expo.md), roadmap M6). It talks to
any VidFriends server through the shared `@vidfriends/contracts` and `@vidfriends/api-client`
packages; there is no default server ([ADR-0014](../../docs/adr/0014-self-host-only-no-public-instance.md)).

## Develop

The app uses native modules (camera, secure storage, share intent, video), so it needs a
development build, not Expo Go.

```sh
pnpm install
pnpm turbo run build --filter=@vidfriends/mobile^...   # contracts + api-client
cd apps/mobile
npx expo run:android        # or: npx expo run:ios (macOS + Xcode)
```

On first launch, paste the address of a running server. A local stack started with
`pnpm dev:services` + `pnpm dev` is reachable from the Android emulator at `http://10.0.2.2:8080`
(plain http is accepted only for private-network addresses, with a warning).

Checks: `pnpm --filter @vidfriends/mobile lint|typecheck|test|bundle`.

## End-to-end tests

`.github/workflows/mobile.yml` builds a release APK, starts the production stack in its emulator
variant (`http://10.0.2.2:8880`), seeds it (`e2e/seed.mjs`) and runs the Maestro flows in
`e2e/` on an Android 14 emulator: join through a join link (J-2), send a link (J-3), sign in as the
recipient, watch, react and reply (J-4/J-5).

## Push notifications

Expo push tokens need the EAS project id of the build (`extra.eas.projectId`). Until the project
has EAS credentials (roadmap M6-T7), builds show push as unavailable and members use the in-app
notification list.

## Accessibility review (NFR-A11Y-02, M6-T6)

- Every control is a `Pressable`/`Button` with `accessibilityRole` and `accessibilityLabel`;
  reactions are a radio group with spoken names; friend pickers are checkboxes with state.
- Errors are announced (`accessibilityRole="alert"`, live regions); headers use the header role.
- Text uses system font scaling (no `allowFontScaling={false}`); touch targets are at least 44 pt.
- The feed does not autoplay when the system asks for reduced motion; the player has an explicit
  play/pause control with a label, and mute/unmute and "React & reply" buttons.
- Colours meet WCAG AA in light and dark mode (`src/ui/theme.ts`).
- Still to verify on devices during the alpha: VoiceOver and TalkBack walk-through of every screen.
