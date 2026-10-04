# User Guide

**Audience:** Non-technical end users of VidFriends
**Last reviewed:** 2026-06-16
**Applies to:** VidFriends v1.0+ (any client app)

---

## Table of Contents

1. [Connecting to a Server](#connecting-to-a-server)
2. [Creating an Account](#creating-an-account)
3. [Logging In](#logging-in)
4. [Sending a Video](#sending-a-video)
5. [Watching Your Feed](#watching-your-feed)
6. [Interacting with Videos](#interacting-with-videos)
7. [Managing Friends](#managing-friends)
8. [Viewing History](#viewing-history)
9. [Managing Notifications](#managing-notifications)

---

## Connecting to a Server

Your friend (the server admin) will give you:

- **A server URL** — something like `https://videos.myfriends.com`
- **An invite code** — a long string of letters and numbers

In the VidFriends app, enter the server URL to connect. If your friend shared a QR code, scan it to connect instantly.

---

## Creating an Account

### Step 1: Open Registration

Navigate to the server URL in your browser or open the app and tap **Create Account**.

### Step 2: Fill in Your Details

| Field         | Description |
|---------------|-------------|
| Email         | Your email address (used for login) |
| Username      | Pick a unique name your friends will see |
| Password      | At least 8 characters |
| Display name  | (Optional) Your real name or nickname |
| Invite code   | Enter the code your friend gave you |

### Step 3: Submit

Tap **Register**. You will be logged in automatically.

---

## Logging In

Once your account is created, log in with your email and password.

If you forget your password, contact the server admin — password reset is not yet self-service.

---

## Sending a Video

VidFriends supports two ways to add a video:

### Option 1: Upload a File

Upload a video file from your device. Supported formats include MP4, MOV, and other common video types.

### Option 2: Share from Another Platform

Paste a link from any supported platform (YouTube, TikTok, Instagram, and others). VidFriends will download the video to your server automatically.

### Send to a Friend

After adding a video, you can send it to any friend:

1. Go to the video detail screen
2. Tap **Send**
3. Select the friend from your friends list
4. (Optional) Add a caption
5. Tap **Send**

Your friend will see the video in their inbox.

### Unsend

If you change your mind, you can unsend a video — but only if your friend has not watched it yet.

---

## Watching Your Feed

### For You Page (FYP)

Your FYP shows videos your friends have sent you, sorted newest first. Videos you have already watched are hidden.

### Main Feed

The main feed shows all public videos on the server, also sorted newest first. Watched videos are hidden here too.

### Video Player

Tap any video to watch it. The player shows:

- Title and description
- Who sent it
- Like and comment counts
- Duration and playback progress

---

## Interacting with Videos

### Like

Tap the heart icon to like a video. Tap it again to unlike.

### Comment

Tap the comment icon to leave a comment. You can reply to other people's comments too (threaded replies).

### React

Tap the reaction button to add an emoji reaction to a video. You can change your emoji by tapping again.

---

## Managing Friends

### Send a Friend Request

Search for a friend by username and send them a request. They will receive a notification.

### Accept or Decline

When someone sends you a friend request:

- **Accept** — you become friends and can send each other videos
- **Decline** — the request is removed

### Block

If you block someone:

- They cannot send you friend requests
- Any existing friendship is removed
- They cannot send you videos

### View Friends

Your friends list shows everyone you are connected with.

---

## Viewing History

Your watch history shows every video you have watched, sorted by most recent. You can:

- Filter by title or description
- Filter by friend who posted
- Filter by date range
- See your progress (where you left off)

---

## Managing Notifications

VidFriends supports push notifications so you know when someone sends you a video or reacts to your content.

### Supported Notification Providers

| Provider | Description |
|----------|-------------|
| **ntfy** | Self-hosted push notifications (ntfy.sh) |
| **Gotify** | Self-hosted push notifications |
| **FCM** | Firebase Cloud Messaging (for Android apps) |
| **APNs** | Apple Push Notification service (for iOS apps) |

### Setting Up Notifications

In the app, go to **Settings** → **Notifications** and enter the details for your chosen provider.

### Notification Events

You can choose which events trigger notifications:

- New video received
- Video liked
- New comment on your video
- Friend request received

### WebSocket (Real-Time)

When the app is open, real-time events come through WebSocket automatically — no configuration needed.
