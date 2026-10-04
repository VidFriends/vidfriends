package push

import "context"

type EventType string

const (
	EventVideoReceived  EventType = "video_received"
	EventFriendRequest  EventType = "friend_request"
	EventFriendAccepted EventType = "friend_accepted"
	EventLike           EventType = "like"
	EventComment        EventType = "comment"
)

type Notification struct {
	Title   string `json:"title"`
	Body    string `json:"body"`
	Tags    string `json:"tags,omitempty"`
	Click   string `json:"click,omitempty"`
	Icon    string `json:"icon,omitempty"`
	Priority int    `json:"priority,omitempty"`
}

type Event struct {
	Type      EventType `json:"type"`
	ActorName string    `json:"actor_name"`
	ActorID   string    `json:"actor_id"`
	TargetID  string    `json:"target_id,omitempty"`
	TargetURL string    `json:"target_url,omitempty"`
}

type Notifier interface {
	Send(ctx context.Context, target string, notification Notification) error
}
