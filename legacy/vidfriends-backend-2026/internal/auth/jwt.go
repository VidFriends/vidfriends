package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenKind string

const (
	AccessToken  TokenKind = "access"
	RefreshToken TokenKind = "refresh"
)

type Claims struct {
	UserID   string    `json:"user_id"`
	Email    string    `json:"email"`
	Username string    `json:"username"`
	Role     string    `json:"role"`
	Kind     TokenKind `json:"kind"`
	jwt.RegisteredClaims
}

type JWTManager struct {
	secret        []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
}

func NewJWTManager(secret string, accessTTL, refreshTTL time.Duration) *JWTManager {
	return &JWTManager{
		secret:     []byte(secret),
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
	}
}

func (m *JWTManager) GenerateAccessToken(userID, email, username, role string) (string, error) {
	return m.generate(userID, email, username, role, AccessToken, m.accessTTL)
}

func (m *JWTManager) GenerateRefreshToken(userID, email, username, role string) (string, error) {
	return m.generate(userID, email, username, role, RefreshToken, m.refreshTTL)
}

func (m *JWTManager) generate(userID, email, username, role string, kind TokenKind, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   userID,
		Email:    email,
		Username: username,
		Role:     role,
		Kind:     kind,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "vidfriends",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *JWTManager) Validate(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

// Keep Generate for backward compatibility
func (m *JWTManager) Generate(userID, email, username, role string) (string, error) {
	return m.GenerateAccessToken(userID, email, username, role)
}
