package push

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNotificationFromEvent(t *testing.T) {
	tests := []struct {
		name     string
		event    Event
		wantTags string
	}{
		{
			name: "video_received",
			event: Event{
				Type:      EventVideoReceived,
				ActorName: "alice",
				ActorID:   "user-1",
				TargetURL: "/videos/v-1",
			},
			wantTags: "incoming_envelope",
		},
		{
			name: "friend_request",
			event: Event{
				Type:      EventFriendRequest,
				ActorName: "bob",
				ActorID:   "user-2",
			},
			wantTags: "wave",
		},
		{
			name: "friend_accepted",
			event: Event{
				Type:      EventFriendAccepted,
				ActorName: "charlie",
				ActorID:   "user-3",
			},
			wantTags: "handshake",
		},
		{
			name: "like",
			event: Event{
				Type:      EventLike,
				ActorName: "dave",
				ActorID:   "user-4",
				TargetURL: "/videos/v-2",
			},
			wantTags: "heart",
		},
		{
			name: "comment",
			event: Event{
				Type:      EventComment,
				ActorName: "eve",
				ActorID:   "user-5",
				TargetURL: "/videos/v-3",
			},
			wantTags: "speech_balloon",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notif := notificationFromEvent(tt.event)
			if notif.Tags != tt.wantTags {
				t.Errorf("expected tags %q, got %q", tt.wantTags, notif.Tags)
			}
			expectedBody := fmt.Sprintf("%s %s", tt.event.ActorName, map[string]string{
				string(EventVideoReceived):  "sent you a video",
				string(EventFriendRequest):  "wants to be friends",
				string(EventFriendAccepted): "accepted your friend request",
				string(EventLike):           "liked your video",
				string(EventComment):        "commented on your video",
			}[string(tt.event.Type)])
			if notif.Body != expectedBody {
				t.Errorf("expected body %q, got %q", expectedBody, notif.Body)
			}
			if notif.Click != tt.event.TargetURL {
				t.Errorf("expected click %q, got %q", tt.event.TargetURL, notif.Click)
			}
		})
	}
}

func TestIsEventEnabled(t *testing.T) {
	enabled := []string{"like", "comment", "friend_request"}

	if !isEventEnabled(enabled, EventLike) {
		t.Error("expected like to be enabled")
	}
	if !isEventEnabled(enabled, EventComment) {
		t.Error("expected comment to be enabled")
	}
	if !isEventEnabled(enabled, EventFriendRequest) {
		t.Error("expected friend_request to be enabled")
	}
	if isEventEnabled(enabled, EventVideoReceived) {
		t.Error("expected video_received to NOT be enabled")
	}
	if isEventEnabled(nil, EventLike) {
		t.Error("expected nil slice to return false")
	}
	if isEventEnabled([]string{}, EventLike) {
		t.Error("expected empty slice to return false")
	}
}

func TestNtfyNotifier_Send_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}
		var body ntfyRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode request: %v", err)
		}
		if body.Topic != "test-topic" {
			t.Errorf("expected topic 'test-topic', got %q", body.Topic)
		}
		if body.Title != "Test Title" {
			t.Errorf("expected title 'Test Title', got %q", body.Title)
		}
		if body.Message != "Test body" {
			t.Errorf("expected message 'Test body', got %q", body.Message)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	n := NewNtfyNotifier(srv.URL)
	err := n.Send(context.Background(), "test-topic", Notification{
		Title: "Test Title",
		Body:  "Test body",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNtfyNotifier_Send_ErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	n := NewNtfyNotifier(srv.URL)
	err := n.Send(context.Background(), "test-topic", Notification{Title: "T", Body: "B"})
	if err == nil {
		t.Fatal("expected error for non-2xx status")
	}
}

func TestNtfyNotifier_Send_DefaultURL(t *testing.T) {
	n := NewNtfyNotifier("")
	if n.baseURL != "https://ntfy.sh" {
		t.Errorf("expected default URL 'https://ntfy.sh', got %q", n.baseURL)
	}
}

func TestGotifyNotifier_Send_Success(t *testing.T) {
	var capturedToken string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		capturedToken = r.URL.Query().Get("token")
		if capturedToken != "test-token" {
			t.Errorf("expected token 'test-token', got %q", capturedToken)
		}
		var body gotifyMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode request: %v", err)
		}
		if body.Title != "Test Title" {
			t.Errorf("expected title 'Test Title', got %q", body.Title)
		}
		if body.Message != "Test body" {
			t.Errorf("expected message 'Test body', got %q", body.Message)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	g := NewGotifyNotifier(srv.URL)
	err := g.Send(context.Background(), "test-token", Notification{
		Title: "Test Title",
		Body:  "Test body",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGotifyNotifier_Send_ErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	g := NewGotifyNotifier(srv.URL)
	err := g.Send(context.Background(), "bad-token", Notification{Title: "T", Body: "B"})
	if err == nil {
		t.Fatal("expected error for non-2xx status")
	}
}

func TestNtfyNotifier_Send_ContextCancelled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	n := NewNtfyNotifier(srv.URL)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := n.Send(ctx, "topic", Notification{Title: "T", Body: "B"})
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}

func TestFCMNotifier_NotImplemented(t *testing.T) {
	f := NewFCMNotifier("")
	err := f.Send(context.Background(), "token", Notification{})
	if err == nil {
		t.Fatal("expected error for unimplemented FCM")
	}
}

func TestAPNsNotifier_NotImplemented(t *testing.T) {
	a := NewAPNsNotifier("", "", "", "")
	err := a.Send(context.Background(), "token", Notification{})
	if err == nil {
		t.Fatal("expected error for unimplemented APNs")
	}
}

func TestEventConstants(t *testing.T) {
	if EventVideoReceived != "video_received" {
		t.Errorf("unexpected EventVideoReceived: %q", EventVideoReceived)
	}
	if EventFriendRequest != "friend_request" {
		t.Errorf("unexpected EventFriendRequest: %q", EventFriendRequest)
	}
	if EventFriendAccepted != "friend_accepted" {
		t.Errorf("unexpected EventFriendAccepted: %q", EventFriendAccepted)
	}
	if EventLike != "like" {
		t.Errorf("unexpected EventLike: %q", EventLike)
	}
	if EventComment != "comment" {
		t.Errorf("unexpected EventComment: %q", EventComment)
	}
}
