# Frequently Asked Questions

**Audience:** All VidFriends users (end users and admins)
**Last reviewed:** 2026-06-16

---

## General

### What happens to my data?

All data stays on your server (the one the admin runs). VidFriends does not use any third-party analytics, tracking, or telemetry. Your videos, comments, likes, and personal information never leave your friends' server.

### Can I delete my account?

Contact your server admin. They can delete your account and all associated data — videos, comments, likes, and friend connections.

### Is VidFriends open source?

Yes. The full source code is available under the AGPL-3.0 license. You can audit, modify, and contribute.

---

## Features

### How does duplicate detection work?

When you upload or share a video link, VidFriends computes a perceptual hash (pHash) of the video content. If another video on the server has a very similar hash (within a configurable threshold, default: 12 bits Hamming distance), they are grouped together as duplicates.

The earliest uploaded video in the group is the "canonical" version. When someone watches a duplicate, they see the canonical version instead — keeping storage efficient while preserving social data (likes, comments) from all copies.

You can view a duplicate group and change which video is canonical via the API.

### What video platforms are supported?

VidFriends can import videos from any platform that [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports. By default, the server restricts import to known platforms, including:

- YouTube (youtube.com, youtu.be)
- TikTok (tiktok.com)
- Instagram (instagram.com)
- Twitter / X (twitter.com, x.com)
- Reddit (reddit.com)
- Facebook (facebook.com)
- Vimeo (vimeo.com)

The server admin can add or remove platforms via the `VIDFRIENDS_ALLOWED_PLATFORMS` environment variable.

---

## Storage

### Can I use my own S3 storage?

Yes. VidFriends supports any S3-compatible object storage. By default it uses MinIO (bundled in docker-compose), but you can point it at:

- AWS S3
- DigitalOcean Spaces
- Backblaze B2
- Cloudflare R2
- Any other S3-compatible provider

Configure via these environment variables: `VIDFRIENDS_S3_ENDPOINT`, `VIDFRIENDS_S3_ACCESS_KEY`, `VIDFRIENDS_S3_SECRET_KEY`, `VIDFRIENDS_S3_BUCKET`, `VIDFRIENDS_S3_USE_SSL`.

### What happens when storage is full?

When the server's disk fills up:

1. New video uploads and downloads will fail
2. The server admin will see errors in the logs
3. The admin should either:
   - Add more storage space
   - Run storage eviction (removes old videos with no engagement)
   - Ask users to delete videos

Automatic per-user quota enforcement is under development ([VID-156](/VID/issues/VID-156)). Until then, admins should monitor usage via the admin API (`/api/admin/storage`).

### How do I free up space?

As a user, delete videos you no longer need. As an admin, run eviction to automatically clean up old, unengaged videos (older than 90 days with no likes or comments).

---

## Notifications

### How do notifications work?

VidFriends supports multiple push notification providers:

| Provider | How it works | Best for |
|----------|-------------|----------|
| **ntfy** | Self-hosted pub/sub via ntfy.sh | Quick setup, no cloud dependencies |
| **Gotify** | Self-hosted push server | Self-contained push |
| **FCM** | Firebase Cloud Messaging | Android apps |
| **APNs** | Apple Push Notification service | iOS apps |

When real-time events are needed, the app uses WebSocket (available at `/api/ws`) for instant delivery without polling.

### Can I choose what notifications I get?

Yes. When setting up notifications, you can select which events trigger a push:

- New video received
- Video liked
- New comment
- Friend request

---

## Account & Access

### I forgot my password

Password reset is not available yet. Contact your server admin to have your password reset manually in the database.

### Can I use the same account on multiple devices?

Yes. Log in with your email and password on any device. Your access token lasts 15 minutes, with a refresh token valid for 7 days.

### Why do I need an invite code?

VidFriends is invite-only by design. Only your server admin can create invite tokens, which keeps your server private and limited to people you trust.

---

## Privacy

### Does VidFriends collect any analytics?

No. There is no built-in analytics, telemetry, or tracking. The server admin can see usage statistics (total users, videos, storage) in the admin API, but that data stays on the server.

### Can the server admin see my videos?

Yes — the admin runs the server and has database access. Choose your server admin wisely (typically a trusted friend or family member).

### Can I export my data?

Data export is not yet available as a self-service feature. Contact your admin if you need your data extracted. A self-service export feature is planned for a future release.
