package github

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func generateTestKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return key
}

func TestSignJWT(t *testing.T) {
	key := generateTestKey(t)
	client := NewClient("12345", key, "67890")

	tokenStr, err := client.signJWT()
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(tok *jwt.Token) (any, error) {
		if _, ok := tok.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, nil
		}
		return &key.PublicKey, nil
	})
	if err != nil {
		t.Fatal(err)
	}

	claims := parsed.Claims.(*jwt.RegisteredClaims)
	if claims.Issuer != "12345" {
		t.Errorf("expected issuer '12345', got %q", claims.Issuer)
	}

	if !claims.ExpiresAt.Time.After(time.Now()) {
		t.Error("token should not be expired")
	}
	if claims.ExpiresAt.Time.After(time.Now().Add(jwtExpiry + time.Minute)) {
		t.Error("token expiry exceeds jwtExpiry")
	}
}

func TestExchangeInstallationToken_Success(t *testing.T) {
	key := generateTestKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/app/installations/67890/access_tokens" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") == "" {
			t.Error("missing Authorization header")
		}
		if r.Header.Get("Accept") != "application/vnd.github.v3+json" {
			t.Errorf("unexpected Accept: %s", r.Header.Get("Accept"))
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{
			"token": "ghs_installation_token_abc123",
			"expires_at": "2026-06-19T00:00:00Z",
			"repository_selection": "all",
			"permissions": {"contents": "write", "pull_requests": "read"}
		}`))
	}))
	defer server.Close()

	client := &Client{
		appID:          "12345",
		privateKey:     key,
		installationID: "67890",
		baseURL:        server.URL,
		httpClient:     server.Client(),
	}

	resp, err := client.ExchangeInstallationToken(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if resp.Token != "ghs_installation_token_abc123" {
		t.Errorf("unexpected token: %s", resp.Token)
	}
	if resp.RepositorySelection != "all" {
		t.Errorf("unexpected selection: %s", resp.RepositorySelection)
	}
	if resp.Permissions["contents"] != "write" {
		t.Errorf("unexpected permission: %v", resp.Permissions)
	}
}

func TestExchangeInstallationToken_Error(t *testing.T) {
	key := generateTestKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message": "Bad credentials"}`))
	}))
	defer server.Close()

	client := &Client{
		appID:          "12345",
		privateKey:     key,
		installationID: "67890",
		baseURL:        server.URL,
		httpClient:     server.Client(),
	}

	_, err := client.ExchangeInstallationToken(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Errorf("expected 401 in error, got: %v", err)
	}
}

func TestParsePrivateKey(t *testing.T) {
	key := generateTestKey(t)
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})

	parsed, err := ParsePrivateKey(pemBytes)
	if err != nil {
		t.Fatal(err)
	}
	if !key.Equal(parsed) {
		t.Error("parsed key does not match original")
	}
}

func TestParsePrivateKey_Invalid(t *testing.T) {
	_, err := ParsePrivateKey([]byte("not a pem block"))
	if err == nil {
		t.Fatal("expected error for invalid PEM")
	}
}

func TestParsePrivateKey_WrongType(t *testing.T) {
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: []byte("not a real key"),
	})
	_, err := ParsePrivateKey(pemBytes)
	if err == nil || !strings.Contains(err.Error(), "unexpected key type") {
		t.Errorf("expected key type error, got: %v", err)
	}
}
