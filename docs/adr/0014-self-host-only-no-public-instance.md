# ADR-0014: Self-host only: no project-operated or public instance, no default domain

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Owner (2026-10-03). The owner said there is no final domain "because its for selfhost", there will be "no public server", and they are "comfortable with the risk, its for private groups". Claude wrote up the consequences.
- **Supersedes in part:** [ADR-0005](0005-instance-model.md), only its clause that "the owner runs the first instance (proposed: `vidfriends.app`)" and that mobile builds may set it as the default. Everything else in ADR-0005 stands.
- **Amends:** [ADR-0013](0013-instance-pairing-and-join-links.md), the mobile Universal/App Links clause.

## Context

ADR-0005 assumed a project-operated default instance at `vidfriends.app`, so that onboarding would need no typed URL. The owner has now decided:

- VidFriends is **self-host only**. The project will not operate a public server.
- There is **no project domain**.
- Downloading platform media for private groups is an **accepted risk** (BRD OQ-1).

## Decision

1. The project ships software only: container images, a compose setup, and the mobile apps. It runs **no** public or default instance. An owner or any operator may run a *private* instance for their own group.
2. **Mobile apps have no default instance.** Onboarding always starts with "Scan QR" or "Paste link", and the in-app scanner reads the join URL ([ADR-0013](0013-instance-pairing-and-join-links.md)).
3. **No Universal Links or App Links.** Association files can't cover arbitrary self-hosted domains, and there is no project domain to host them. When a join URL is opened on a phone, it opens the instance's **web** join page. That page offers a "Open in the VidFriends app" hint telling the user to scan the same QR code from inside the app.
4. **No identifier requires a domain.** App bundle and package IDs use a namespace the owner controls without a domain (proposed: `io.github.vidfriends.mobile`).
5. `link_download_enabled` stays default **true**. The operator remains responsible for their instance (BC-5).

## Consequences

- Each operator needs a stable origin for their instance, for TLS and for QR codes. That can be a home domain, a dynamic-DNS name, or a LAN address (WF-PAIR-3).
- Mobile push still uses the Expo relay under the publisher's Expo project. This is unchanged ([ADR-0011](0011-notifications.md)).
- The M5 alpha is a **private** instance run by the owner for their group, not a public launch.
