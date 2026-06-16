//go:build integration

package integration

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var testPool *pgxpool.Pool

func testDB(t *testing.T) *pgxpool.Pool {
	if testPool == nil {
		dbURL := getEnv("VIDFRIENDS_DATABASE_URL", "postgres://vidfriends:vidfriends@localhost:5432/vidfriends?sslmode=disable")
		ctx := context.Background()
		pool, err := pgxpool.New(ctx, dbURL)
		if err != nil {
			t.Fatalf("connect to database: %v", err)
		}
		testPool = pool
	}
	return testPool
}

func createInviteToken(t *testing.T) string {
	t.Helper()
	db := testDB(t)
	tokenBytes := make([]byte, 16)
	if _, err := rand.Read(tokenBytes); err != nil {
		t.Fatalf("generate token: %v", err)
	}
	token := hex.EncodeToString(tokenBytes)

	_, err := db.Exec(context.Background(),
		`INSERT INTO invite_tokens (token, expires_at, created_by)
		 VALUES ($1, now() + interval '30 days', (SELECT id FROM users LIMIT 1))`,
		token,
	)
	if err != nil {
		// If no users exist yet, create an admin user first
		var userID string
		err = db.QueryRow(context.Background(),
			`INSERT INTO users (email, username, password_hash, role)
			 VALUES ('admin@test.local', 'admin', '$2a$10$dummy', 'admin')
			 RETURNING id`,
		).Scan(&userID)
		if err != nil {
			t.Fatalf("create admin user: %v", err)
		}
		_, err = db.Exec(context.Background(),
			`INSERT INTO invite_tokens (token, expires_at, created_by)
			 VALUES ($1, now() + interval '30 days', $2)`,
			token, userID,
		)
		if err != nil {
			t.Fatalf("insert invite token after admin create: %v", err)
		}
	}
	return token
}

type authResult struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

type testUser struct {
	AccessToken  string
	RefreshToken string
	Username     string
	Email        string
}

func registerUser(t *testing.T, addr, email, username, password string) *testUser {
	t.Helper()
	inviteCode := createInviteToken(t)
	body := fmt.Sprintf(
		`{"email":"%s","username":"%s","password":"%s","invite_code":"%s"}`,
		email, username, password, inviteCode,
	)
	resp, err := http.Post(addr+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("register %s: %v", username, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		data, _ := io.ReadAll(resp.Body)
		t.Fatalf("register %s status %d: %s", username, resp.StatusCode, string(data))
	}
	var result authResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode register %s: %v", username, err)
	}
	if result.AccessToken == "" {
		t.Fatalf("register %s: empty access_token", username)
	}
	if result.RefreshToken == "" {
		t.Fatalf("register %s: empty refresh_token", username)
	}
	return &testUser{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		Username:     username,
		Email:        email,
	}
}

func apiPost(addr, path, token, body string) (*http.Response, error) {
	req, err := http.NewRequest("POST", addr+path, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return http.DefaultClient.Do(req)
}

func apiGet(addr, path, token string) (*http.Response, error) {
	req, err := http.NewRequest("GET", addr+path, nil)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return http.DefaultClient.Do(req)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ---- Infrastructure Tests ----

func TestHealthEndpoint(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")

	resp, err := http.Get(addr + "/api/health")
	if err != nil {
		t.Fatalf("health request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body struct {
		Status   string `json:"status"`
		Database string `json:"database"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Status != "ok" {
		t.Fatalf("expected status 'ok', got %q", body.Status)
	}
	if body.Database != "ok" {
		t.Fatalf("expected database 'ok', got %q", body.Database)
	}
}

func TestDatabaseMigration(t *testing.T) {
	db := testDB(t)
	ctx := t.Context()

	tables := []string{"users", "videos", "comments", "likes", "hashes", "watch_history", "received_videos", "reactions", "invite_tokens", "refresh_tokens"}
	for _, table := range tables {
		var exists bool
		err := db.QueryRow(ctx,
			"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)",
			table,
		).Scan(&exists)
		if err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if !exists {
			t.Errorf("expected table %q to exist after migration", table)
		}
	}
}

func TestMinIOConnectivity(t *testing.T) {
	endpoint := getEnv("VIDFRIENDS_S3_ENDPOINT", "localhost:9000")
	accessKey := getEnv("VIDFRIENDS_S3_ACCESS_KEY", "minioadmin")
	secretKey := getEnv("VIDFRIENDS_S3_SECRET_KEY", "minioadmin")
	bucket := getEnv("VIDFRIENDS_S3_BUCKET", "vidfriends-videos")
	useSSL := os.Getenv("VIDFRIENDS_S3_USE_SSL") == "true"

	endpoint = strings.TrimPrefix(endpoint, "http://")
	endpoint = strings.TrimPrefix(endpoint, "https://")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		t.Fatalf("create minio client: %v", err)
	}

	ctx := t.Context()

	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		t.Fatalf("check bucket exists: %v", err)
	}
	if !exists {
		err = client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
		if err != nil {
			t.Fatalf("create bucket %q: %v", bucket, err)
		}
		t.Logf("created bucket %q", bucket)
	}

	info, err := client.PutObject(ctx, bucket, "smoke-test-"+time.Now().Format("150405.000")+".txt",
		strings.NewReader("smoke test content"),
		int64(len("smoke test content")),
		minio.PutObjectOptions{ContentType: "text/plain"},
	)
	if err != nil {
		t.Fatalf("put object to minio: %v", err)
	}
	if info.Size != int64(len("smoke test content")) {
		t.Fatalf("expected size %d, got %d", len("smoke test content"), info.Size)
	}
}

// ---- Auth Tests ----

func TestAuthRegister(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	invite := createInviteToken(t)

	t.Run("successful registration", func(t *testing.T) {
		body := fmt.Sprintf(
			`{"email":"fresh@test.com","username":"fresh_user","password":"password123","invite_code":"%s"}`,
			invite,
		)
		resp, err := http.Post(addr+"/api/auth/register", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 201, got %d: %s", resp.StatusCode, string(data))
		}
		var result authResult
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if result.AccessToken == "" {
			t.Error("expected non-empty access_token")
		}
		if result.RefreshToken == "" {
			t.Error("expected non-empty refresh_token")
		}
		if result.ExpiresIn != 900 {
			t.Errorf("expected expires_in 900, got %d", result.ExpiresIn)
		}
	})

	t.Run("missing invite code", func(t *testing.T) {
		body := `{"email":"noinvite@test.com","username":"noinvite","password":"password123"}`
		resp, err := http.Post(addr+"/api/auth/register", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("invalid invite code", func(t *testing.T) {
		body := `{"email":"badcode@test.com","username":"badcode","password":"password123","invite_code":"invalid-token"}`
		resp, err := http.Post(addr+"/api/auth/register", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("duplicate email", func(t *testing.T) {
		inv := createInviteToken(t)
		body := fmt.Sprintf(
			`{"email":"dupe@test.com","username":"dupe1","password":"password123","invite_code":"%s"}`,
			inv,
		)
		resp, err := http.Post(addr+"/api/auth/register", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}

		inv2 := createInviteToken(t)
		body2 := fmt.Sprintf(
			`{"email":"dupe@test.com","username":"dupe2","password":"password123","invite_code":"%s"}`,
			inv2,
		)
		resp2, err := http.Post(addr+"/api/auth/register", "application/json", strings.NewReader(body2))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp2.Body.Close()
		if resp2.StatusCode != http.StatusConflict {
			t.Errorf("expected 409, got %d", resp2.StatusCode)
		}
	})

	t.Run("short password", func(t *testing.T) {
		inv := createInviteToken(t)
		body := fmt.Sprintf(
			`{"email":"shortpw@test.com","username":"shortpw","password":"123","invite_code":"%s"}`,
			inv,
		)
		resp, err := http.Post(addr+"/api/auth/register", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", resp.StatusCode)
		}
	})
}

func TestAuthLogin(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	user := registerUser(t, addr, "logintest@test.com", "login_user", "password123")

	t.Run("successful login", func(t *testing.T) {
		body := `{"email":"logintest@test.com","password":"password123"}`
		resp, err := http.Post(addr+"/api/auth/login", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
		var result authResult
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if result.AccessToken == "" {
			t.Error("expected non-empty access_token")
		}
		if result.RefreshToken == "" {
			t.Error("expected non-empty refresh_token")
		}
		if result.AccessToken == user.AccessToken {
			t.Error("login should issue a new access token, not the same as registration")
		}
	})

	t.Run("wrong password", func(t *testing.T) {
		body := `{"email":"logintest@test.com","password":"wrongpassword"}`
		resp, err := http.Post(addr+"/api/auth/login", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("nonexistent user", func(t *testing.T) {
		body := `{"email":"nobody@test.com","password":"password123"}`
		resp, err := http.Post(addr+"/api/auth/login", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})
}

func TestAuthRefresh(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	user := registerUser(t, addr, "refreshtest@test.com", "refresh_user", "password123")

	t.Run("successful refresh", func(t *testing.T) {
		body := fmt.Sprintf(`{"refresh_token":"%s"}`, user.RefreshToken)
		resp, err := http.Post(addr+"/api/auth/refresh", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
		var result authResult
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if result.AccessToken == "" {
			t.Error("expected non-empty access_token")
		}
		if result.RefreshToken == "" {
			t.Error("expected non-empty refresh_token")
		}
		if result.RefreshToken == user.RefreshToken {
			t.Error("refresh should rotate the refresh token")
		}
	})

	t.Run("refresh token reuse rejected", func(t *testing.T) {
		body := fmt.Sprintf(`{"refresh_token":"%s"}`, user.RefreshToken)
		resp, err := http.Post(addr+"/api/auth/refresh", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			data, _ := io.ReadAll(resp.Body)
			t.Errorf("expected 401 for reused token, got %d: %s", resp.StatusCode, string(data))
		}
	})

	t.Run("invalid token format", func(t *testing.T) {
		body := `{"refresh_token":"not-a-real-token"}`
		resp, err := http.Post(addr+"/api/auth/refresh", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("missing refresh_token", func(t *testing.T) {
		body := `{}`
		resp, err := http.Post(addr+"/api/auth/refresh", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", resp.StatusCode)
		}
	})
}

func TestAuthMiddleware(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	user := registerUser(t, addr, "authmwtest@test.com", "authmw_user", "password123")

	t.Run("authenticated request succeeds", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/feed", user.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusUnauthorized {
			t.Fatal("got 401 with valid token")
		}
	})

	t.Run("missing token is rejected", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/feed", "")
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("invalid token is rejected", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/feed", "Bearer invalidtoken")
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})
}

func TestAuthAdminMiddleware(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	user := registerUser(t, addr, "adminmwtest@test.com", "adminmw_user", "password123")

	t.Run("regular user rejected from admin endpoint", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/stats", user.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("expected 403, got %d", resp.StatusCode)
		}
	})
}

func TestAuthMe(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	user := registerUser(t, addr, "authmetest@test.com", "authme_user", "password123")

	t.Run("returns user profile with valid token", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/auth/me", user.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decode response: %v", err)
		}

		if body["id"] == "" {
			t.Error("expected non-empty user id")
		}
		if body["email"] != user.Email {
			t.Errorf("expected email %q, got %v", user.Email, body["email"])
		}
		if body["username"] != user.Username {
			t.Errorf("expected username %q, got %v", user.Username, body["username"])
		}
		if body["role"] != "user" {
			t.Errorf("expected role 'user', got %v", body["role"])
		}
		if _, exists := body["password_hash"]; exists {
			t.Error("password_hash should not be exposed")
		}
	})

	t.Run("rejects request without token", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/auth/me", "")
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("rejects invalid token", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/auth/me", "invalidtoken")
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})
}

// ---- Social Tests (migrated to new auth) ----

func TestSocialFriendsFlow(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")

	alice := registerUser(t, addr, "alice-social@test.com", "alice_social", "password123")
	bob := registerUser(t, addr, "bob-social@test.com", "bob_social", "password123")

	t.Run("SendFriendInvite", func(t *testing.T) {
		resp, err := apiPost(addr, "/api/friends/invite", alice.AccessToken, `{"username":"bob_social"}`)
		if err != nil {
			t.Fatalf("invite request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 201, got %d: %s", resp.StatusCode, string(data))
		}
	})

	t.Run("AcceptFriendInvite", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/friends/requests", bob.AccessToken)
		if err != nil {
			t.Fatalf("list requests: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var requests []struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&requests); err != nil {
			t.Fatalf("decode requests: %v", err)
		}
		if len(requests) != 1 {
			t.Fatalf("expected 1 request, got %d", len(requests))
		}
		reqID := requests[0].ID

		resp, err = apiPost(addr, "/api/friends/accept/"+reqID, bob.AccessToken, `{"action":"accept"}`)
		if err != nil {
			t.Fatalf("accept request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
	})

	t.Run("ListFriends", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/friends", alice.AccessToken)
		if err != nil {
			t.Fatalf("list friends: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var friends []struct {
			UserID   string `json:"user_id"`
			Username string `json:"username"`
			Status   string `json:"status"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&friends); err != nil {
			t.Fatalf("decode friends: %v", err)
		}
		if len(friends) != 1 {
			t.Fatalf("expected 1 friend, got %d", len(friends))
		}
		if friends[0].Username != "bob_social" {
			t.Fatalf("expected bob_social, got %s", friends[0].Username)
		}
	})
}

func TestSocialSendReceive(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")

	sender := registerUser(t, addr, "sender-int@test.com", "sender_user", "password123")
	receiver := registerUser(t, addr, "receiver-int@test.com", "receiver_user", "password123")

	resp, err := apiPost(addr, "/api/friends/invite", sender.AccessToken, `{"username":"receiver_user"}`)
	if err != nil {
		t.Fatalf("send invite: %v", err)
	}
	resp.Body.Close()

	resp, err = apiGet(addr, "/api/friends/requests", receiver.AccessToken)
	if err != nil {
		t.Fatalf("get requests: %v", err)
	}
	var requests []struct {
		ID string `json:"id"`
	}
	json.NewDecoder(resp.Body).Decode(&requests)
	resp.Body.Close()

	if len(requests) > 0 {
		resp, err = apiPost(addr, "/api/friends/accept/"+requests[0].ID, receiver.AccessToken, `{"action":"accept"}`)
		if err != nil {
			t.Fatalf("accept: %v", err)
		}
		resp.Body.Close()
	}

	var videoID string
	{
		body := bytes.NewBufferString(`{"title":"Test Video","description":"test"}`)
		req, err := http.NewRequest("POST", addr+"/api/videos", body)
		if err != nil {
			t.Fatalf("create video request: %v", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+sender.AccessToken)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("create video: %v", err)
		}
		var result struct {
			ID string `json:"id"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()
		videoID = result.ID
	}

	if videoID == "" {
		t.Fatal("failed to create video")
	}

	t.Run("SendVideoToFriend", func(t *testing.T) {
		friendResp, err := apiGet(addr, "/api/friends", sender.AccessToken)
		if err != nil {
			t.Fatalf("list friends: %v", err)
		}
		var friends []struct {
			UserID string `json:"user_id"`
		}
		json.NewDecoder(friendResp.Body).Decode(&friends)
		friendResp.Body.Close()

		if len(friends) == 0 {
			t.Fatal("no friends to send to")
		}

		payload := fmt.Sprintf(`{"video_id":"%s","caption":"check this out!"}`, videoID)
		resp, err := apiPost(addr, "/api/send/"+friends[0].UserID, sender.AccessToken, payload)
		if err != nil {
			t.Fatalf("send video: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 201, got %d: %s", resp.StatusCode, string(data))
		}
	})

	t.Run("GetInbox", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/inbox", receiver.AccessToken)
		if err != nil {
			t.Fatalf("get inbox: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var inbox []struct {
			ID         string  `json:"id"`
			VideoID    string  `json:"video_id"`
			SenderName string  `json:"sender_name"`
			Caption    *string `json:"caption,omitempty"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&inbox); err != nil {
			t.Fatalf("decode inbox: %v", err)
		}
		if len(inbox) == 0 {
			t.Fatal("expected at least 1 received video")
		}
		if inbox[0].SenderName != "sender_user" {
			t.Fatalf("expected sender_user, got %s", inbox[0].SenderName)
		}
	})

	t.Run("GetFYPFeed", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/feed/fyp", receiver.AccessToken)
		if err != nil {
			t.Fatalf("get FYP feed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var feed []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&feed); err != nil {
			t.Fatalf("decode feed: %v", err)
		}
		if len(feed) == 0 {
			t.Fatal("expected at least 1 video in FYP feed")
		}
	})
}

func TestSocialBlock(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")

	blocker := registerUser(t, addr, "blocker-int@test.com", "blocker_user", "password123")
	blockee := registerUser(t, addr, "blockee-int@test.com", "blockee_user", "password123")

	var blockeeID string

	resp, err := apiPost(addr, "/api/friends/invite", blockee.AccessToken, `{"username":"blocker_user"}`)
	if err != nil {
		t.Fatalf("send invite: %v", err)
	}
	resp.Body.Close()

	resp, err = apiGet(addr, "/api/friends/requests", blocker.AccessToken)
	if err != nil {
		t.Fatalf("get requests: %v", err)
	}
	var requests []struct {
		ID     string `json:"id"`
		UserID string `json:"user_id"`
	}
	json.NewDecoder(resp.Body).Decode(&requests)
	resp.Body.Close()

	if len(requests) > 0 {
		blockeeID = requests[0].UserID
	}

	if blockeeID == "" {
		resp, err = apiGet(addr, "/api/friends", blocker.AccessToken)
		if err == nil {
			var friends []struct {
				UserID string `json:"user_id"`
			}
			json.NewDecoder(resp.Body).Decode(&friends)
			resp.Body.Close()
			for _, f := range friends {
				if f.UserID != "" {
					blockeeID = f.UserID
					break
				}
			}
		}
	}

	blockPath := "/api/friends/block/" + blockeeID
	resp, err = apiPost(addr, blockPath, blocker.AccessToken, `{}`)
	if err != nil {
		t.Fatalf("block user: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
	}
}
func TestAdminStats(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	admin := registerUser(t, addr, "admin-stats-test@example.com", "admin_stats", "password123")

	t.Run("regular user forbidden", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/stats", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("expected 403, got %d", resp.StatusCode)
		}
	})

	t.Run("admin can access stats", func(t *testing.T) {
		promoteToAdmin(t, admin.Email)
		resp, err := apiGet(addr, "/api/admin/stats", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
		var stats struct {
			TotalVideos      int `json:"total_videos"`
			TotalStorage     int `json:"total_storage"`
			TotalUsers       int `json:"total_users"`
			ActiveUsersToday int `json:"active_users_today"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if stats.TotalUsers < 1 {
			t.Errorf("expected at least 1 user, got %d", stats.TotalUsers)
		}
	})
}

func TestAdminUsers(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	admin := registerUser(t, addr, "admin-users-test@example.com", "admin_users", "password123")
	promoteToAdmin(t, admin.Email)

	t.Run("list users", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/users", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
		var users []struct {
			ID       string `json:"id"`
			Email    string `json:"email"`
			Username string `json:"username"`
			Role     string `json:"role"`
			Status   string `json:"status"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(users) == 0 {
			t.Fatal("expected at least 1 user")
		}
	})

	t.Run("filter by role", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/users?role=admin", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var users []struct {
			Role string `json:"role"`
		}
		json.NewDecoder(resp.Body).Decode(&users)
		for _, u := range users {
			if u.Role != "admin" {
				t.Errorf("expected role 'admin', got %q", u.Role)
			}
		}
	})

	t.Run("filter by email", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/users?email=admin-users", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var users []struct {
			Email string `json:"email"`
		}
		json.NewDecoder(resp.Body).Decode(&users)
		if len(users) == 0 {
			t.Error("expected at least 1 matching user")
		}
	})
}

func TestAdminUpdateUser(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	admin := registerUser(t, addr, "admin-update-test@example.com", "admin_update", "password123")
	promoteToAdmin(t, admin.Email)

	target := registerUser(t, addr, "target-update@example.com", "target_user", "password123")

	var targetID string
	err := testDB(t).QueryRow(context.Background(),
		`SELECT id FROM users WHERE email = $1`, target.Email,
	).Scan(&targetID)
	if err != nil {
		t.Fatalf("lookup target user: %v", err)
	}

	t.Run("update role", func(t *testing.T) {
		resp, err := apiPatch(addr, "/api/admin/users/"+targetID, admin.AccessToken, `{"role":"admin"}`)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
	})

	t.Run("update status", func(t *testing.T) {
		resp, err := apiPatch(addr, "/api/admin/users/"+targetID, admin.AccessToken, `{"status":"suspended"}`)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
	})

	t.Run("invalid role rejected", func(t *testing.T) {
		resp, err := apiPatch(addr, "/api/admin/users/"+targetID, admin.AccessToken, `{"role":"superadmin"}`)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("nonexistent user", func(t *testing.T) {
		resp, err := apiPatch(addr, "/api/admin/users/00000000-0000-0000-0000-000000000000", admin.AccessToken, `{"role":"admin"}`)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminStorageBreakdown(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	admin := registerUser(t, addr, "admin-storage-test@example.com", "admin_storage", "password123")
	promoteToAdmin(t, admin.Email)

	resp, err := apiGet(addr, "/api/admin/storage", admin.AccessToken)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
	}
	var items []struct {
		UserID      string `json:"user_id"`
		Username    string `json:"username"`
		StorageUsed int64  `json:"storage_used"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

func TestAdminActivityLog(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	admin := registerUser(t, addr, "admin-activity-test@example.com", "admin_activity", "password123")
	promoteToAdmin(t, admin.Email)

	t.Run("list activity log", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/activity", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
		var result struct {
			Entries []any `json:"entries"`
			Total   int   `json:"total"`
			Limit   int   `json:"limit"`
			Offset  int   `json:"offset"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Fatalf("decode: %v", err)
		}
	})

	t.Run("filter by action", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/activity?action=admin_update_user", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("pagination", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/activity?limit=5&offset=0", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})
}

func TestAdminDeleteVideo(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	admin := registerUser(t, addr, "admin-delvideo-test@example.com", "admin_delvideo", "password123")
	promoteToAdmin(t, admin.Email)

	var videoID string
	{
		body := bytes.NewBufferString(`{"title":"Admin Delete Test","description":"to be deleted"}`)
		req, _ := http.NewRequest("POST", addr+"/api/videos", body)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+admin.AccessToken)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("create video: %v", err)
		}
		var result struct{ ID string `json:"id"` }
		json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()
		videoID = result.ID
	}
	if videoID == "" {
		t.Fatal("failed to create video")
	}

	t.Run("admin delete video", func(t *testing.T) {
		req, _ := http.NewRequest("DELETE", addr+"/api/admin/videos/"+videoID, nil)
		req.Header.Set("Authorization", "Bearer "+admin.AccessToken)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("delete video request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
		}
	})

	t.Run("delete nonexistent video", func(t *testing.T) {
		req, _ := http.NewRequest("DELETE", addr+"/api/admin/videos/00000000-0000-0000-0000-000000000000", nil)
		req.Header.Set("Authorization", "Bearer "+admin.AccessToken)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminEvictionRun(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	admin := registerUser(t, addr, "admin-evict-test@example.com", "admin_evict", "password123")
	promoteToAdmin(t, admin.Email)

	resp, err := apiPost(addr, "/api/admin/eviction/run", admin.AccessToken, `{}`)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(data))
	}
	var result struct {
		Status  string `json:"status"`
		Evicted int64  `json:"evicted"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if result.Status != "eviction_complete" {
		t.Errorf("expected 'eviction_complete', got %q", result.Status)
	}
}

func TestAdminInviteTokens(t *testing.T) {
	addr := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	admin := registerUser(t, addr, "admin-invite-test@example.com", "admin_invite", "password123")
	promoteToAdmin(t, admin.Email)

	t.Run("create invite", func(t *testing.T) {
		future := time.Now().Add(24 * time.Hour).Format(time.RFC3339)
		body := fmt.Sprintf(`{"expires_at":"%s"}`, future)
		resp, err := apiPost(addr, "/api/admin/invites", admin.AccessToken, body)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 201, got %d: %s", resp.StatusCode, string(data))
		}
		var result struct {
			Token     string `json:"token"`
			ExpiresAt string `json:"expires_at"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if result.Token == "" {
			t.Error("expected non-empty token")
		}
	})

	t.Run("list invites", func(t *testing.T) {
		resp, err := apiGet(addr, "/api/admin/invites", admin.AccessToken)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var invites []any
		json.NewDecoder(resp.Body).Decode(&invites)
		if len(invites) == 0 {
			t.Error("expected at least 1 invite")
		}
	})
}

// ---- Test Helpers ----

func promoteToAdmin(t *testing.T, email string) {
	t.Helper()
	db := testDB(t)
	_, err := db.Exec(context.Background(),
		`UPDATE users SET role = 'admin' WHERE email = $1`, email,
	)
	if err != nil {
		t.Fatalf("promote to admin: %v", err)
	}
}

func apiPatch(addr, path, token, body string) (*http.Response, error) {
	req, err := http.NewRequest("PATCH", addr+path, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return http.DefaultClient.Do(req)
}

