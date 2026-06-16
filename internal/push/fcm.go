package push

import (
	"context"
	"fmt"
)

type FCMNotifier struct {
	credentialsFile string
}

func NewFCMNotifier(credentialsFile string) *FCMNotifier {
	return &FCMNotifier{credentialsFile: credentialsFile}
}

func (f *FCMNotifier) Send(ctx context.Context, token string, notif Notification) error {
	return fmt.Errorf("fcm not implemented: adapter disabled by default, provide credentials to enable")
}
