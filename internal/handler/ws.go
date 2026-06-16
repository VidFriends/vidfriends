package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
	sendBufSize    = 64
)

const (
	EventNewVideo       = "new_video"
	EventVideoDownloaded = "video_downloaded"
	EventLiked          = "liked"
	EventCommented      = "commented"
	EventFriendRequest  = "friend_request"
)

type Notification struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type NewVideoPayload struct {
	VideoID string `json:"video_id"`
	Title   string `json:"title"`
	UserID  string `json:"user_id"`
}

type VideoDownloadedPayload struct {
	VideoID string `json:"video_id"`
	UserID  string `json:"user_id"`
}

type LikedPayload struct {
	VideoID string `json:"video_id"`
	UserID  string `json:"user_id"`
	LikedBy string `json:"liked_by"`
}

type CommentedPayload struct {
	VideoID   string `json:"video_id"`
	CommentID string `json:"comment_id"`
	UserID    string `json:"user_id"`
	Body      string `json:"body"`
}

type FriendRequestPayload struct {
	FromUserID   string `json:"from_user_id"`
	FromUsername string `json:"from_username"`
}

func NewVideoNotification(videoID, title, userID string) Notification {
	return Notification{
		Type: EventNewVideo,
		Payload: NewVideoPayload{
			VideoID: videoID,
			Title:   title,
			UserID:  userID,
		},
	}
}

func VideoDownloadedNotification(videoID, userID string) Notification {
	return Notification{
		Type: EventVideoDownloaded,
		Payload: VideoDownloadedPayload{
			VideoID: videoID,
			UserID:  userID,
		},
	}
}

func LikedNotification(videoID, userID, likedBy string) Notification {
	return Notification{
		Type: EventLiked,
		Payload: LikedPayload{
			VideoID: videoID,
			UserID:  userID,
			LikedBy: likedBy,
		},
	}
}

func CommentedNotification(videoID, commentID, userID, body string) Notification {
	return Notification{
		Type: EventCommented,
		Payload: CommentedPayload{
			VideoID:   videoID,
			CommentID: commentID,
			UserID:    userID,
			Body:      body,
		},
	}
}

func FriendRequestNotification(fromUserID, fromUsername string) Notification {
	return Notification{
		Type: EventFriendRequest,
		Payload: FriendRequestPayload{
			FromUserID:   fromUserID,
			FromUsername: fromUsername,
		},
	}
}

type perConnLimiter struct {
	mu       sync.Mutex
	tokens   float64
	lastRefill time.Time
	rate     float64
	burst    int
}

func newPerConnLimiter(rate float64, burst int) *perConnLimiter {
	return &perConnLimiter{
		tokens:    float64(burst),
		lastRefill: time.Now(),
		rate:      rate,
		burst:     burst,
	}
}

func (l *perConnLimiter) Allow() bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(l.lastRefill).Seconds()
	l.lastRefill = now
	l.tokens += elapsed * l.rate
	if l.tokens > float64(l.burst) {
		l.tokens = float64(l.burst)
	}

	if l.tokens >= 1 {
		l.tokens--
		return true
	}
	return false
}

type Client struct {
	hub     *WSHub
	conn    *websocket.Conn
	send    chan []byte
	userID  string
	limiter *perConnLimiter
	rooms   map[string]struct{}
}

type WSHub struct {
	mu         sync.RWMutex
	clients    map[string]map[*Client]struct{}
	register   chan *Client
	unregister chan *Client
	stopCh     chan struct{}
}

func NewWSHub() *WSHub {
	return &WSHub{
		clients:    make(map[string]map[*Client]struct{}),
		register:   make(chan *Client, 256),
		unregister: make(chan *Client, 256),
		stopCh:     make(chan struct{}),
	}
}

func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if _, ok := h.clients[client.userID]; !ok {
				h.clients[client.userID] = make(map[*Client]struct{})
			}
			h.clients[client.userID][client] = struct{}{}
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if conns, ok := h.clients[client.userID]; ok {
				if _, exists := conns[client]; exists {
					delete(conns, client)
					close(client.send)
					if len(conns) == 0 {
						delete(h.clients, client.userID)
					}
				}
			}
			h.mu.Unlock()

		case <-h.stopCh:
			return
		}
	}
}

func (h *WSHub) Stop() {
	close(h.stopCh)
}

func (h *WSHub) SendToUser(userID string, n Notification) {
	data, err := json.Marshal(n)
	if err != nil {
		slog.Error("marshal notification", "error", err)
		return
	}

	h.mu.RLock()
	conns, ok := h.clients[userID]
	h.mu.RUnlock()

	if !ok {
		return
	}

	for client := range conns {
		select {
		case client.send <- data:
		default:
			slog.Warn("client send buffer full, dropping message", "user", userID)
		}
	}
}

func (h *WSHub) SendToUsers(userIDs []string, n Notification) {
	for _, uid := range userIDs {
		h.SendToUser(uid, n)
	}
}

func (h *WSHub) ConnectedCount(userID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[userID])
}

func (h *WSHub) TotalConnections() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	total := 0
	for _, conns := range h.clients {
		total += len(conns)
	}
	return total
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Warn("websocket read error", "user", c.userID, "error", err)
			}
			break
		}

		if !c.limiter.Allow() {
			c.send <- []byte(`{"error":"rate limit exceeded"}`)
			continue
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte("\n"))
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

type WSHandler struct {
	hub  *WSHub
	jwt  *auth.JWTManager
	db   *pgxpool.Pool
}

func NewWSHandler(hub *WSHub, jwt *auth.JWTManager, db *pgxpool.Pool) *WSHandler {
	return &WSHandler{hub: hub, jwt: jwt, db: db}
}

func (h *WSHandler) ServeWS() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenStr := r.URL.Query().Get("token")
		if tokenStr == "" {
			http.Error(w, `{"error":"missing token"}`, http.StatusUnauthorized)
			return
		}

		claims, err := h.jwt.Validate(tokenStr)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Error("websocket upgrade failed", "error", err)
			return
		}

		client := &Client{
			hub:     h.hub,
			conn:    conn,
			send:    make(chan []byte, sendBufSize),
			userID:  claims.UserID,
			limiter: newPerConnLimiter(10, 20),
			rooms:   make(map[string]struct{}),
		}

		h.hub.register <- client
		slog.Info("websocket connected", "user", client.userID)

		go client.writePump()
		go client.readPump()
	}
}
