package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/middleware"
	"vidfriends.ai/backend/internal/oauth"
)

type OAuthHandler struct {
	db          *pgxpool.Pool
	providers   map[string]oauth.Provider
	tokenStore  *oauth.TokenStore
}

func NewOAuthHandler(db *pgxpool.Pool, providers map[string]oauth.Provider, tokenStore *oauth.TokenStore) *OAuthHandler {
	return &OAuthHandler{db: db, providers: providers, tokenStore: tokenStore}
}

func (h *OAuthHandler) ListProviders() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		tokens, err := h.tokenStore.ListByUser(r.Context(), claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list providers")
			return
		}

		connected := make(map[string]bool)
		connectedAt := make(map[string]string)
		for _, t := range tokens {
			connected[t.Provider] = true
			connectedAt[t.Provider] = t.CreatedAt.Format("2006-01-02T15:04:05Z")
		}

		var infos []oauth.ProviderInfo
		for name, p := range h.providers {
			info := oauth.ProviderInfo{
				Name:      name,
				AuthURL:   p.AuthURL(claims.UserID),
				Connected: connected[name],
			}
			if connected[name] {
				info.ConnectedAt = connectedAt[name]
			}
			infos = append(infos, info)
		}

		writeJSON(w, http.StatusOK, map[string]any{"providers": infos})
	}
}

type oauthCallbackRequest struct {
	Provider string `json:"provider"`
	Code     string `json:"code"`
	State    string `json:"state"`
	RedirectURI string `json:"redirect_uri"`
}

func (h *OAuthHandler) Callback() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		providerName := r.URL.Query().Get("provider")
		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")
		redirectURI := r.URL.Query().Get("redirect_uri")

		if providerName == "" || code == "" {
			writeError(w, http.StatusBadRequest, "missing provider or code")
			return
		}

		if state == "" {
			writeError(w, http.StatusBadRequest, "missing state parameter")
			return
		}

		provider, ok := h.providers[providerName]
		if !ok {
			writeError(w, http.StatusBadRequest, "unsupported provider")
			return
		}

		if redirectURI == "" {
			redirectURI = providerName
		}

		token, err := provider.Exchange(r.Context(), code, redirectURI)
		if err != nil {
			writeError(w, http.StatusBadGateway, "token exchange failed: "+err.Error())
			return
		}

		userName := ""
		err = h.tokenStore.Save(r.Context(), state, providerName, token, userName)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save token")
			return
		}

		http.Redirect(w, r, "/api/oauth/providers", http.StatusFound)
	}
}

func (h *OAuthHandler) Connect() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		var req struct {
			Provider    string `json:"provider"`
			Code        string `json:"code"`
			RedirectURI string `json:"redirect_uri"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Provider == "" || req.Code == "" {
			writeError(w, http.StatusBadRequest, "provider and code are required")
			return
		}

		provider, ok := h.providers[req.Provider]
		if !ok {
			writeError(w, http.StatusBadRequest, "unsupported provider")
			return
		}

		redirectURI := req.RedirectURI
		if redirectURI == "" {
			redirectURI = req.Provider
		}

		token, err := provider.Exchange(r.Context(), req.Code, redirectURI)
		if err != nil {
			writeError(w, http.StatusBadGateway, "token exchange failed: "+err.Error())
			return
		}

		err = h.tokenStore.Save(r.Context(), claims.UserID, req.Provider, token, "")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save token")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"status":   "connected",
			"provider": req.Provider,
		})
	}
}

func (h *OAuthHandler) Disconnect() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		providerName := r.PathValue("provider")

		stored, err := h.tokenStore.Get(r.Context(), claims.UserID, providerName)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch token")
			return
		}
		if stored == nil {
			writeError(w, http.StatusNotFound, "provider not connected")
			return
		}

		if provider, ok := h.providers[providerName]; ok {
			_ = provider.Revoke(r.Context(), &oauth.Token{
				AccessToken: stored.AccessToken,
			})
		}

		if err := h.tokenStore.Delete(r.Context(), claims.UserID, providerName); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to disconnect")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "disconnected"})
	}
}

func (h *OAuthHandler) GetAuthURL() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		providerName := r.PathValue("provider")

		provider, ok := h.providers[providerName]
		if !ok {
			writeError(w, http.StatusBadRequest, "unsupported provider")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"auth_url": provider.AuthURL(claims.UserID),
			"provider": providerName,
		})
	}
}

func (h *OAuthHandler) ListPlaylists() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		providerName := r.PathValue("provider")

		provider, ok := h.providers[providerName]
		if !ok {
			writeError(w, http.StatusBadRequest, "unsupported provider")
			return
		}

		stored, err := h.tokenStore.Get(r.Context(), claims.UserID, providerName)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch token")
			return
		}
		if stored == nil {
			writeError(w, http.StatusUnauthorized, "provider not connected")
			return
		}

		token := &oauth.Token{
			AccessToken:  stored.AccessToken,
			RefreshToken: stored.RefreshToken,
			TokenType:    stored.TokenType,
		}

		playlists, err := provider.ListPlaylists(r.Context(), token)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusUnauthorized, "token expired, please reconnect")
				return
			}
			writeError(w, http.StatusBadGateway, "failed to list playlists: "+err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"playlists": playlists,
			"provider":  providerName,
		})
	}
}
