package handler

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNewWSHub(t *testing.T) {
	hub := NewWSHub()
	if hub == nil {
		t.Fatal("expected non-nil hub")
	}
	if hub.clients == nil {
		t.Fatal("expected clients map to be initialized")
	}
}

func TestHubRegisterAndUnregister(t *testing.T) {
	hub := NewWSHub()
	go hub.Run()

	client := &Client{
		hub:    hub,
		send:   make(chan []byte, sendBufSize),
		userID: "user-1",
		rooms:  make(map[string]struct{}),
	}

	hub.register <- client
	time.Sleep(10 * time.Millisecond)

	if n := hub.ConnectedCount("user-1"); n != 1 {
		t.Fatalf("expected 1 connection, got %d", n)
	}

	hub.unregister <- client
	time.Sleep(10 * time.Millisecond)

	if n := hub.ConnectedCount("user-1"); n != 0 {
		t.Fatalf("expected 0 connections after unregister, got %d", n)
	}

	hub.Stop()
}

func TestHubSendToUser(t *testing.T) {
	hub := NewWSHub()
	go hub.Run()

	client := &Client{
		hub:    hub,
		send:   make(chan []byte, sendBufSize),
		userID: "user-1",
		rooms:  make(map[string]struct{}),
	}

	hub.register <- client
	time.Sleep(10 * time.Millisecond)

	notif := Notification{
		Type:    EventNewVideo,
		Payload: NewVideoPayload{VideoID: "v1", Title: "test", UserID: "user-1"},
	}

	hub.SendToUser("user-1", notif)

	select {
	case msg := <-client.send:
		var received Notification
		if err := json.Unmarshal(msg, &received); err != nil {
			t.Fatalf("failed to unmarshal message: %v", err)
		}
		if received.Type != EventNewVideo {
			t.Fatalf("expected type %q, got %q", EventNewVideo, received.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message")
	}

	hub.unregister <- client
	time.Sleep(10 * time.Millisecond)
	hub.Stop()
}

func TestHubSendToNonexistentUser(t *testing.T) {
	hub := NewWSHub()

	hub.SendToUser("no-such-user", Notification{
		Type:    EventNewVideo,
		Payload: NewVideoPayload{VideoID: "v1", Title: "test", UserID: "user-1"},
	})
}

func TestHubConnectedCount(t *testing.T) {
	hub := NewWSHub()
	go hub.Run()

	c1 := &Client{hub: hub, send: make(chan []byte, sendBufSize), userID: "user-1", rooms: make(map[string]struct{})}
	c2 := &Client{hub: hub, send: make(chan []byte, sendBufSize), userID: "user-1", rooms: make(map[string]struct{})}

	hub.register <- c1
	hub.register <- c2
	time.Sleep(10 * time.Millisecond)

	if n := hub.ConnectedCount("user-1"); n != 2 {
		t.Fatalf("expected 2 connections, got %d", n)
	}

	if n := hub.ConnectedCount("user-2"); n != 0 {
		t.Fatalf("expected 0 connections for unknown user, got %d", n)
	}

	hub.unregister <- c1
	time.Sleep(10 * time.Millisecond)

	if n := hub.ConnectedCount("user-1"); n != 1 {
		t.Fatalf("expected 1 connection after unregister, got %d", n)
	}

	hub.unregister <- c2
	time.Sleep(10 * time.Millisecond)
	hub.Stop()
}

func TestHubTotalConnections(t *testing.T) {
	hub := NewWSHub()
	go hub.Run()

	c1 := &Client{hub: hub, send: make(chan []byte, sendBufSize), userID: "user-1", rooms: make(map[string]struct{})}
	c2 := &Client{hub: hub, send: make(chan []byte, sendBufSize), userID: "user-2", rooms: make(map[string]struct{})}

	hub.register <- c1
	hub.register <- c2
	time.Sleep(10 * time.Millisecond)

	if n := hub.TotalConnections(); n != 2 {
		t.Fatalf("expected 2 total connections, got %d", n)
	}

	hub.unregister <- c1
	time.Sleep(10 * time.Millisecond)

	if n := hub.TotalConnections(); n != 1 {
		t.Fatalf("expected 1 total connection, got %d", n)
	}

	hub.unregister <- c2
	time.Sleep(10 * time.Millisecond)
	hub.Stop()
}

func TestSendToUsers(t *testing.T) {
	hub := NewWSHub()
	go hub.Run()

	c1 := &Client{hub: hub, send: make(chan []byte, sendBufSize), userID: "user-1", rooms: make(map[string]struct{})}
	c2 := &Client{hub: hub, send: make(chan []byte, sendBufSize), userID: "user-2", rooms: make(map[string]struct{})}

	hub.register <- c1
	hub.register <- c2
	time.Sleep(10 * time.Millisecond)

	notif := Notification{Type: EventLiked, Payload: LikedPayload{VideoID: "v1", UserID: "user-1", LikedBy: "user-2"}}
	hub.SendToUsers([]string{"user-1", "user-2"}, notif)

	select {
	case <-c1.send:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message to user-1")
	}

	select {
	case <-c2.send:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message to user-2")
	}

	hub.unregister <- c1
	hub.unregister <- c2
	time.Sleep(10 * time.Millisecond)
	hub.Stop()
}

func TestPerConnLimiter(t *testing.T) {
	l := newPerConnLimiter(100, 5)

	first := l.Allow()
	if !first {
		t.Fatal("expected first request to be allowed")
	}

	l.tokens = 0
	denied := l.Allow()
	if denied {
		t.Fatal("expected request to be denied when tokens are exhausted")
	}
}

func TestNewVideoNotification(t *testing.T) {
	n := NewVideoNotification("v1", "My Video", "u1")

	if n.Type != EventNewVideo {
		t.Fatalf("expected type %q, got %q", EventNewVideo, n.Type)
	}

	payload, ok := n.Payload.(NewVideoPayload)
	if !ok {
		t.Fatal("expected NewVideoPayload")
	}
	if payload.VideoID != "v1" || payload.Title != "My Video" || payload.UserID != "u1" {
		t.Fatal("payload fields mismatch")
	}
}

func TestVideoDownloadedNotification(t *testing.T) {
	n := VideoDownloadedNotification("v1", "u1")

	if n.Type != EventVideoDownloaded {
		t.Fatalf("expected type %q, got %q", EventVideoDownloaded, n.Type)
	}

	payload, ok := n.Payload.(VideoDownloadedPayload)
	if !ok {
		t.Fatal("expected VideoDownloadedPayload")
	}
	if payload.VideoID != "v1" || payload.UserID != "u1" {
		t.Fatal("payload fields mismatch")
	}
}

func TestLikedNotification(t *testing.T) {
	n := LikedNotification("v1", "u1", "u2")

	if n.Type != EventLiked {
		t.Fatalf("expected type %q, got %q", EventLiked, n.Type)
	}

	payload, ok := n.Payload.(LikedPayload)
	if !ok {
		t.Fatal("expected LikedPayload")
	}
	if payload.VideoID != "v1" || payload.UserID != "u1" || payload.LikedBy != "u2" {
		t.Fatal("payload fields mismatch")
	}
}

func TestCommentedNotification(t *testing.T) {
	n := CommentedNotification("v1", "c1", "u1", "Nice video!")

	if n.Type != EventCommented {
		t.Fatalf("expected type %q, got %q", EventCommented, n.Type)
	}

	payload, ok := n.Payload.(CommentedPayload)
	if !ok {
		t.Fatal("expected CommentedPayload")
	}
	if payload.VideoID != "v1" || payload.CommentID != "c1" || payload.UserID != "u1" || payload.Body != "Nice video!" {
		t.Fatal("payload fields mismatch")
	}
}

func TestFriendRequestNotification(t *testing.T) {
	n := FriendRequestNotification("u1", "alice")

	if n.Type != EventFriendRequest {
		t.Fatalf("expected type %q, got %q", EventFriendRequest, n.Type)
	}

	payload, ok := n.Payload.(FriendRequestPayload)
	if !ok {
		t.Fatal("expected FriendRequestPayload")
	}
	if payload.FromUserID != "u1" || payload.FromUsername != "alice" {
		t.Fatal("payload fields mismatch")
	}
}

func TestNotificationJSONMarshal(t *testing.T) {
	n := NewVideoNotification("v1", "My Video", "u1")
	data, err := json.Marshal(n)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	var typeVal string
	if err := json.Unmarshal(decoded["type"], &typeVal); err != nil {
		t.Fatalf("unmarshal type error: %v", err)
	}
	if typeVal != EventNewVideo {
		t.Fatalf("expected type %q, got %q", EventNewVideo, typeVal)
	}
}

func TestHubStop(t *testing.T) {
	hub := NewWSHub()
	go hub.Run()

	hub.Stop()

	_, ok := <-hub.stopCh
	if ok {
		t.Fatal("expected stopCh to be closed after Stop()")
	}
}
