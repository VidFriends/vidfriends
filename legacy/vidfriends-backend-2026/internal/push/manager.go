package push

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PushManager struct {
	db      *pgxpool.Pool
	ntfy    *NtfyNotifier
	gotify  *GotifyNotifier
	fcm     *FCMNotifier
	apns    *APNsNotifier
}

func NewPushManager(db *pgxpool.Pool, ntfyURL, gotifyURL, fcmCreds, apnsKeyFile, apnsKeyID, apnsTeamID, apnsTopic string) *PushManager {
	m := &PushManager{db: db}

	if ntfyURL != "" {
		m.ntfy = NewNtfyNotifier(ntfyURL)
		slog.Info("push: ntfy notifier enabled", "url", ntfyURL)
	}
	if gotifyURL != "" {
		m.gotify = NewGotifyNotifier(gotifyURL)
		slog.Info("push: gotify notifier enabled", "url", gotifyURL)
	}
	if fcmCreds != "" {
		m.fcm = NewFCMNotifier(fcmCreds)
		slog.Info("push: fcm notifier enabled")
	}
	if apnsKeyFile != "" {
		m.apns = NewAPNsNotifier(apnsKeyFile, apnsKeyID, apnsTeamID, apnsTopic)
		slog.Info("push: apns notifier enabled")
	}

	if m.ntfy == nil && m.gotify == nil && m.fcm == nil && m.apns == nil {
		slog.Warn("push: no notifier configured, push notifications disabled")
	}

	return m
}

var eventNotificationMap = map[EventType]struct {
	Title   string
	BodyFmt string
	Tags    string
	Icon    string
	Priority int
}{
	EventVideoReceived: {
		Title:    "New Video Received",
		BodyFmt:  "%s sent you a video",
		Tags:     "incoming_envelope",
		Icon:     "https://vidfriends.ai/icon.png",
		Priority: 3,
	},
	EventFriendRequest: {
		Title:    "Friend Request",
		BodyFmt:  "%s wants to be friends",
		Tags:     "wave",
		Priority: 3,
	},
	EventFriendAccepted: {
		Title:    "Friend Request Accepted",
		BodyFmt:  "%s accepted your friend request",
		Tags:     "handshake",
		Priority: 2,
	},
	EventLike: {
		Title:    "New Like",
		BodyFmt:  "%s liked your video",
		Tags:     "heart",
		Priority: 2,
	},
	EventComment: {
		Title:    "New Comment",
		BodyFmt:  "%s commented on your video",
		Tags:     "speech_balloon",
		Priority: 2,
	},
}

func notificationFromEvent(event Event) Notification {
	tmpl := eventNotificationMap[event.Type]
	return Notification{
		Title:    tmpl.Title,
		Body:     fmt.Sprintf(tmpl.BodyFmt, event.ActorName),
		Tags:     tmpl.Tags,
		Icon:     tmpl.Icon,
		Click:    event.TargetURL,
		Priority: tmpl.Priority,
	}
}

func (m *PushManager) Notify(ctx context.Context, recipientID string, event Event) {
	if m.ntfy == nil && m.gotify == nil && m.fcm == nil && m.apns == nil {
		return
	}

	pref, err := m.getPreference(ctx, recipientID)
	if err != nil {
		slog.Debug("push: no preference for user, skipping", "user_id", recipientID, "error", err)
		return
	}

	if !isEventEnabled(pref.EnabledEvents, event.Type) {
		slog.Debug("push: event not enabled for user", "user_id", recipientID, "event", event.Type)
		return
	}

	notif := notificationFromEvent(event)

	if m.ntfy != nil && pref.NtfyTopic != nil && *pref.NtfyTopic != "" {
		go func() {
			if err := m.ntfy.Send(context.Background(), *pref.NtfyTopic, notif); err != nil {
				slog.Error("push: ntfy send failed", "user_id", recipientID, "error", err)
			}
		}()
	}

	if m.gotify != nil && pref.GotifyToken != nil && *pref.GotifyToken != "" {
		target := *pref.GotifyToken
		go func() {
			if err := m.gotify.Send(context.Background(), target, notif); err != nil {
				slog.Error("push: gotify send failed", "user_id", recipientID, "error", err)
			}
		}()
	}

	if m.fcm != nil && pref.FCMToken != nil && *pref.FCMToken != "" {
		go func() {
			if err := m.fcm.Send(context.Background(), *pref.FCMToken, notif); err != nil {
				slog.Error("push: fcm send failed", "user_id", recipientID, "error", err)
			}
		}()
	}

	if m.apns != nil && pref.APNSToken != nil && *pref.APNSToken != "" {
		go func() {
			if err := m.apns.Send(context.Background(), *pref.APNSToken, notif); err != nil {
				slog.Error("push: apns send failed", "user_id", recipientID, "error", err)
			}
		}()
	}
}

type pushPreferenceRow struct {
	NtfyTopic     *string
	GotifyURL     *string
	GotifyToken   *string
	FCMToken      *string
	APNSToken     *string
	EnabledEvents []string
}

func (m *PushManager) getPreference(ctx context.Context, userID string) (*pushPreferenceRow, error) {
	var row pushPreferenceRow
	err := m.db.QueryRow(ctx,
		`SELECT ntfy_topic, gotify_url, gotify_token, fcm_token, apns_token, enabled_events
		 FROM push_preferences WHERE user_id = $1`,
		userID,
	).Scan(&row.NtfyTopic, &row.GotifyURL, &row.GotifyToken, &row.FCMToken, &row.APNSToken, &row.EnabledEvents)
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func isEventEnabled(enabled []string, event EventType) bool {
	for _, e := range enabled {
		if e == string(event) {
			return true
		}
	}
	return false
}
