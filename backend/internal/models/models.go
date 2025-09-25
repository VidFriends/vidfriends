package models

import "time"

type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

type Session struct {
	ID        int64
	UserID    int64
	Token     string
	ExpiresAt time.Time
	CreatedAt time.Time
}

type Video struct {
	ID          int64     `json:"id"`
	OwnerID     int64     `json:"ownerId"`
	URL         string    `json:"url"`
	Title       string    `json:"title"`
	Thumbnail   string    `json:"thumbnail"`
	Duration    int       `json:"duration"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Share struct {
	ID        int64     `json:"id"`
	VideoID   int64     `json:"videoId"`
	SenderID  int64     `json:"senderId"`
	TargetID  int64     `json:"targetId"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"createdAt"`
	Video     *Video    `json:"video"`
	Sender    *User     `json:"sender"`
}
