package github

import (
	"bytes"
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	githubAPIBase  = "https://api.github.com"
	jwtExpiry      = 10 * time.Minute
	requestTimeout = 30 * time.Second
)

type InstallationTokenResponse struct {
	Token               string            `json:"token"`
	ExpiresAt           time.Time         `json:"expires_at"`
	RepositorySelection string            `json:"repository_selection"`
	Permissions         map[string]string `json:"permissions"`
}

type Client struct {
	appID          string
	privateKey     *rsa.PrivateKey
	installationID string
	baseURL        string
	httpClient     *http.Client
}

func NewClient(appID string, privateKey *rsa.PrivateKey, installationID string) *Client {
	return &Client{
		appID:          appID,
		privateKey:     privateKey,
		installationID: installationID,
		baseURL:        githubAPIBase,
		httpClient: &http.Client{
			Timeout: requestTimeout,
		},
	}
}

func (c *Client) signJWT() (string, error) {
	now := time.Now()
	claims := &jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(jwtExpiry)),
		Issuer:    c.appID,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(c.privateKey)
}

func (c *Client) ExchangeInstallationToken(ctx context.Context) (*InstallationTokenResponse, error) {
	jwtToken, err := c.signJWT()
	if err != nil {
		return nil, fmt.Errorf("sign jwt: %w", err)
	}

	url := c.baseURL + "/app/installations/" + c.installationID + "/access_tokens"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(nil))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("github api error (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp InstallationTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	return &tokenResp, nil
}

func ParsePrivateKey(pemBytes []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("no PEM data found")
	}
	if block.Type != "RSA PRIVATE KEY" {
		return nil, fmt.Errorf("unexpected key type: %s", block.Type)
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func LoadPrivateKey(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read key file: %w", err)
	}
	return ParsePrivateKey(data)
}
