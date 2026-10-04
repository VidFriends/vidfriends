package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
)

type ErrorResponse struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg})
}

func encodeCursor(createdAt string) string {
	return base64.URLEncoding.EncodeToString([]byte(createdAt))
}

func decodeCursor(token string) (string, error) {
	b, err := base64.URLEncoding.DecodeString(token)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
