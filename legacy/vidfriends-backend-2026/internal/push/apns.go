package push

import (
	"context"
	"fmt"
)

type APNsNotifier struct {
	keyFile string
	keyID   string
	teamID  string
	topic   string
}

func NewAPNsNotifier(keyFile, keyID, teamID, topic string) *APNsNotifier {
	return &APNsNotifier{
		keyFile: keyFile,
		keyID:   keyID,
		teamID:  teamID,
		topic:   topic,
	}
}

func (a *APNsNotifier) Send(ctx context.Context, token string, notif Notification) error {
	return fmt.Errorf("apns not implemented: adapter disabled by default, provide credentials to enable")
}
