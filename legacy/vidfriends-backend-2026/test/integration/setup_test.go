//go:build integration

package integration

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func init() {
	waitForServices()
}

func waitForServices() {
	apiURL := getEnv("VIDFRIENDS_ADDR", "http://localhost:8080")
	deadline := time.Now().Add(60 * time.Second)
	interval := 2 * time.Second

	for time.Now().Before(deadline) {
		resp, err := http.Get(apiURL + "/api/health")
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			fmt.Fprintf(os.Stderr, "integration tests: API ready at %s\n", apiURL)
			return
		}
		if err == nil {
			resp.Body.Close()
		}
		time.Sleep(interval)
	}

	fmt.Fprintf(os.Stderr, "integration tests: API not ready within timeout, tests may fail\n")
}
