package importer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/pgtype"
	"vidfriends.ai/backend/internal/downloader"
	"vidfriends.ai/backend/internal/oauth"
)

type ProgressEvent struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type JobProgress struct {
	JobID          string `json:"job_id"`
	Status         string `json:"status"`
	TotalItems     int    `json:"total_items"`
	ProcessedItems int    `json:"processed_items"`
	FailedItems    int    `json:"failed_items"`
	SkippedItems   int    `json:"skipped_items"`
	CurrentItem    string `json:"current_item,omitempty"`
}

type importJob struct {
	ID                string
	UserID            string
	CollectionID      pgtype.Text
	Provider          string
	SourcePlaylistID  string
	SourcePlaylistTitle string
	Status            string
	TotalItems        int
	ProcessedItems    int
	FailedItems       int
	SkippedItems      int
	ErrorMessage      string
}

type importJobItem struct {
	ID           string
	JobID        string
	SourceVideoID string
	SourceTitle  string
	SourceURL    string
	Status       string
	ErrorMessage string
	VideoID      pgtype.Text
}

type Manager struct {
	db             *pgxpool.Pool
	dlManager      *downloader.Manager
	ytProvider     oauth.Provider
	tokenStore     *oauth.TokenStore
	notify         func(userID string, event ProgressEvent)
	active      map[string]context.CancelFunc
	mu          sync.Mutex
	workerSem   chan struct{}
}

func NewManager(db *pgxpool.Pool, dlManager *downloader.Manager, ytProvider oauth.Provider, tokenStore *oauth.TokenStore, notify func(userID string, event ProgressEvent)) *Manager {
	return &Manager{
		db:         db,
		dlManager:  dlManager,
		ytProvider: ytProvider,
		tokenStore: tokenStore,
		notify:     notify,
		active:     make(map[string]context.CancelFunc),
		workerSem:  make(chan struct{}, 3),
	}
}

func (m *Manager) CreateJob(ctx context.Context, userID, provider, playlistID, playlistTitle string) (*importJob, error) {
	var job importJob
	err := m.db.QueryRow(ctx, `
		INSERT INTO import_jobs (user_id, provider, source_playlist_id, source_playlist_title, status)
		VALUES ($1, $2, $3, $4, 'pending')
		RETURNING id, user_id, collection_id, provider, source_playlist_id,
		          source_playlist_title, status, total_items, processed_items,
		          failed_items, skipped_items, error_message
	`, userID, provider, playlistID, playlistTitle).Scan(
		&job.ID, &job.UserID, &job.CollectionID, &job.Provider,
		&job.SourcePlaylistID, &job.SourcePlaylistTitle, &job.Status,
		&job.TotalItems, &job.ProcessedItems, &job.FailedItems,
		&job.SkippedItems, &job.ErrorMessage,
	)
	if err != nil {
		return nil, fmt.Errorf("create import job: %w", err)
	}
	return &job, nil
}

func (m *Manager) GetJob(ctx context.Context, jobID string) (*importJob, error) {
	var job importJob
	err := m.db.QueryRow(ctx, `
		SELECT id, user_id, collection_id, provider, source_playlist_id,
		       source_playlist_title, status, total_items, processed_items,
		       failed_items, skipped_items, error_message
		FROM import_jobs
		WHERE id = $1
	`, jobID).Scan(
		&job.ID, &job.UserID, &job.CollectionID, &job.Provider,
		&job.SourcePlaylistID, &job.SourcePlaylistTitle, &job.Status,
		&job.TotalItems, &job.ProcessedItems, &job.FailedItems,
		&job.SkippedItems, &job.ErrorMessage,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &job, err
}

func (m *Manager) ListJobs(ctx context.Context, userID string) ([]importJob, error) {
	rows, err := m.db.Query(ctx, `
		SELECT id, user_id, collection_id, provider, source_playlist_id,
		       source_playlist_title, status, total_items, processed_items,
		       failed_items, skipped_items, error_message
		FROM import_jobs
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 50
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []importJob
	for rows.Next() {
		var j importJob
		if err := rows.Scan(
			&j.ID, &j.UserID, &j.CollectionID, &j.Provider,
			&j.SourcePlaylistID, &j.SourcePlaylistTitle, &j.Status,
			&j.TotalItems, &j.ProcessedItems, &j.FailedItems,
			&j.SkippedItems, &j.ErrorMessage,
		); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

func (m *Manager) ListJobItems(ctx context.Context, jobID string) ([]importJobItem, error) {
	rows, err := m.db.Query(ctx, `
		SELECT id, job_id, source_video_id, source_title, source_url,
		       status, error_message, video_id
		FROM import_job_items
		WHERE job_id = $1
		ORDER BY created_at
	`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []importJobItem
	for rows.Next() {
		var item importJobItem
		if err := rows.Scan(
			&item.ID, &item.JobID, &item.SourceVideoID, &item.SourceTitle,
			&item.SourceURL, &item.Status, &item.ErrorMessage, &item.VideoID,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (m *Manager) GetNextPendingJob(ctx context.Context) (*importJob, error) {
	var job importJob
	err := m.db.QueryRow(ctx, `
		UPDATE import_jobs
		SET status = 'running', updated_at = now()
		WHERE id = (
			SELECT id FROM import_jobs
			WHERE status = 'pending'
			ORDER BY created_at ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		RETURNING id, user_id, collection_id, provider, source_playlist_id,
		          source_playlist_title, status, total_items, processed_items,
		          failed_items, skipped_items, error_message
	`).Scan(
		&job.ID, &job.UserID, &job.CollectionID, &job.Provider,
		&job.SourcePlaylistID, &job.SourcePlaylistTitle, &job.Status,
		&job.TotalItems, &job.ProcessedItems, &job.FailedItems,
		&job.SkippedItems, &job.ErrorMessage,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &job, err
}

func (m *Manager) CancelJob(ctx context.Context, jobID string) error {
	m.mu.Lock()
	if cancel, ok := m.active[jobID]; ok {
		cancel()
		delete(m.active, jobID)
	}
	m.mu.Unlock()

	_, err := m.db.Exec(ctx,
		`UPDATE import_jobs SET status = 'cancelled', updated_at = now() WHERE id = $1`,
		jobID,
	)
	return err
}

func (m *Manager) StartWorker(ctx context.Context) {
	go func() {
		slog.Info("import worker started")
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				slog.Info("import worker stopped")
				return
			case <-ticker.C:
				job, err := m.GetNextPendingJob(ctx)
				if err != nil {
					slog.Error("import worker: fetch job", "error", err)
					continue
				}
				if job == nil {
					continue
				}

				m.workerSem <- struct{}{}
				go func(j *importJob) {
					defer func() { <-m.workerSem }()
					m.processJob(context.Background(), j)
				}(job)
			}
		}
	}()
}

func (m *Manager) processJob(ctx context.Context, job *importJob) {
	slog.Info("processing import job", "job_id", job.ID, "playlist", job.SourcePlaylistID)

	ctx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()

	m.mu.Lock()
	m.active[job.ID] = cancel
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.active, job.ID)
		m.mu.Unlock()
	}()

	storedToken, err := m.tokenStore.Get(ctx, job.UserID, job.Provider)
	if err != nil {
		m.failJob(ctx, job.ID, fmt.Sprintf("fetch oauth token: %v", err))
		return
	}
	if storedToken == nil {
		m.failJob(ctx, job.ID, "oauth token not found")
		return
	}

	token := &oauth.Token{
		AccessToken:  storedToken.AccessToken,
		RefreshToken: storedToken.RefreshToken,
		TokenType:    storedToken.TokenType,
	}

	if storedToken.ExpiresAt != nil && time.Now().After(*storedToken.ExpiresAt) {
		newToken, err := m.ytProvider.RefreshToken(ctx, storedToken.RefreshToken)
		if err != nil {
			m.failJob(ctx, job.ID, fmt.Sprintf("refresh token: %v", err))
			return
		}
		token = newToken
		err = m.tokenStore.Save(ctx, job.UserID, job.Provider, newToken, storedToken.ProviderUserName)
		if err != nil {
			slog.Error("save refreshed token", "error", err)
		}
	}

	items, err := m.ytProvider.ListPlaylistItems(ctx, token, job.SourcePlaylistID)
	if err != nil {
		m.failJob(ctx, job.ID, fmt.Sprintf("list playlist items: %v", err))
		return
	}

	m.sendProgress(job.UserID, JobProgress{
		JobID:          job.ID,
		Status:         "running",
		TotalItems:     len(items),
		ProcessedItems: 0,
	})

	totalItems := len(items)
	_, dbErr := m.db.Exec(ctx,
		`UPDATE import_jobs SET total_items = $1, updated_at = now() WHERE id = $2`,
		totalItems, job.ID,
	)
	if dbErr != nil {
		slog.Error("update total items", "error", dbErr)
	}

	for _, item := range items {
		if ctx.Err() != nil {
			return
		}

		dbItem, insertErr := m.insertJobItem(ctx, job.ID, item)
		if insertErr != nil {
			slog.Error("insert job item", "error", insertErr)
			continue
		}

		m.sendProgress(job.UserID, JobProgress{
			JobID:          job.ID,
			Status:         "running",
			TotalItems:     totalItems,
			ProcessedItems: job.ProcessedItems + job.FailedItems + job.SkippedItems,
			CurrentItem:    item.Title,
		})

		if err := m.processItem(ctx, job, dbItem); err != nil {
			slog.Error("process item failed", "item_id", dbItem.ID, "error", err)
			m.markItemFailed(ctx, dbItem.ID, err.Error())
			job.FailedItems++
		} else {
			job.ProcessedItems++
		}

		m.db.Exec(ctx,
			`UPDATE import_jobs SET processed_items = $1, failed_items = $2, skipped_items = $3, updated_at = now() WHERE id = $4`,
			job.ProcessedItems, job.FailedItems, job.SkippedItems, job.ID,
		)
	}

	_, _ = m.db.Exec(ctx,
		`UPDATE import_jobs SET status = 'completed', updated_at = now() WHERE id = $1`,
		job.ID,
	)

	m.sendProgress(job.UserID, JobProgress{
		JobID:          job.ID,
		Status:         "completed",
		TotalItems:     totalItems,
		ProcessedItems: job.ProcessedItems,
		FailedItems:    job.FailedItems,
		SkippedItems:   job.SkippedItems,
	})

	collectionID, err := m.createCollectionForJob(ctx, job)
	if err != nil {
		slog.Error("create collection for import", "job_id", job.ID, "error", err)
	} else {
		m.db.Exec(ctx,
			`UPDATE import_jobs SET collection_id = $1, updated_at = now() WHERE id = $2`,
			collectionID, job.ID,
		)
	}

	slog.Info("import job completed",
		"job_id", job.ID,
		"total", totalItems,
		"processed", job.ProcessedItems,
		"failed", job.FailedItems,
	)
}

func (m *Manager) insertJobItem(ctx context.Context, jobID string, item oauth.PlaylistItem) (*importJobItem, error) {
	var dbItem importJobItem
	err := m.db.QueryRow(ctx, `
		INSERT INTO import_job_items (job_id, source_video_id, source_title, source_url, status)
		VALUES ($1, $2, $3, $4, 'pending')
		RETURNING id, job_id, source_video_id, source_title, source_url,
		          status, error_message, video_id
	`, jobID, item.VideoID, item.Title, item.URL).Scan(
		&dbItem.ID, &dbItem.JobID, &dbItem.SourceVideoID, &dbItem.SourceTitle,
		&dbItem.SourceURL, &dbItem.Status, &dbItem.ErrorMessage, &dbItem.VideoID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert job item: %w", err)
	}
	return &dbItem, nil
}

func (m *Manager) processItem(ctx context.Context, job *importJob, item *importJobItem) error {
	m.markItemProcessing(ctx, item.ID)

	var existingID string
	err := m.db.QueryRow(ctx,
		`SELECT id FROM videos WHERE source_url = $1 AND user_id = $2 LIMIT 1`,
		item.SourceURL, job.UserID,
	).Scan(&existingID)
	if err == nil {
		m.markItemSkipped(ctx, item.ID, existingID, "duplicate")
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("check duplicate: %w", err)
	}

	var videoID string
	err = m.db.QueryRow(ctx, `
		INSERT INTO videos (user_id, title, source_url, source_platform, status)
		VALUES ($1, $2, $3, 'youtube', 'processing')
		RETURNING id
	`, job.UserID, item.SourceTitle, item.SourceURL).Scan(&videoID)
	if err != nil {
		return fmt.Errorf("create video: %w", err)
	}

	_, err = m.db.Exec(ctx,
		`UPDATE import_job_items SET video_id = $1, status = 'processing', updated_at = now() WHERE id = $2`,
		videoID, item.ID,
	)
	if err != nil {
		slog.Error("update item video_id", "error", err)
	}

	slog.Info("processing import item",
		"job_id", job.ID, "item_id", item.ID,
		"video_id", videoID, "url", item.SourceURL,
	)

	m.markItemCompleted(ctx, item.ID, videoID)
	return nil
}

func (m *Manager) markItemProcessing(ctx context.Context, itemID string) {
	m.db.Exec(ctx,
		`UPDATE import_job_items SET status = 'processing', updated_at = now() WHERE id = $1`,
		itemID,
	)
}

func (m *Manager) markItemCompleted(ctx context.Context, itemID, videoID string) {
	m.db.Exec(ctx,
		`UPDATE import_job_items SET status = 'completed', video_id = $1, updated_at = now() WHERE id = $2`,
		videoID, itemID,
	)
}

func (m *Manager) markItemFailed(ctx context.Context, itemID, errMsg string) {
	if len(errMsg) > 500 {
		errMsg = errMsg[:500]
	}
	m.db.Exec(ctx,
		`UPDATE import_job_items SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
		errMsg, itemID,
	)
}

func (m *Manager) markItemSkipped(ctx context.Context, itemID, videoID, reason string) {
	m.db.Exec(ctx,
		`UPDATE import_job_items SET status = 'skipped', video_id = $1, error_message = $2, updated_at = now() WHERE id = $3`,
		videoID, reason, itemID,
	)
}

func (m *Manager) failJob(ctx context.Context, jobID, errMsg string) {
	if len(errMsg) > 1000 {
		errMsg = errMsg[:1000]
	}
	m.db.Exec(ctx,
		`UPDATE import_jobs SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
		errMsg, jobID,
	)
}

func (m *Manager) createCollectionForJob(ctx context.Context, job *importJob) (string, error) {
	title := job.SourcePlaylistTitle
	if title == "" {
		title = "Imported from " + job.Provider
	}

	var collectionID string
	err := m.db.QueryRow(ctx, `
		INSERT INTO collections (user_id, name, description, source_platform, source_playlist_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, job.UserID, title, "Imported playlist", job.Provider, job.SourcePlaylistID).Scan(&collectionID)
	if err != nil {
		return "", fmt.Errorf("create collection: %w", err)
	}

	rows, err := m.db.Query(ctx, `
		SELECT video_id FROM import_job_items
		WHERE job_id = $1 AND video_id IS NOT NULL AND status = 'completed'
	`, job.ID)
	if err != nil {
		return collectionID, nil
	}
	defer rows.Close()

	for rows.Next() {
		var videoID string
		if err := rows.Scan(&videoID); err != nil {
			continue
		}
		m.db.Exec(ctx,
			`INSERT INTO collection_videos (collection_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			collectionID, videoID,
		)
	}

	_, _ = m.db.Exec(ctx,
		`UPDATE collections SET video_count = (SELECT COUNT(*) FROM collection_videos WHERE collection_id = $1) WHERE id = $1`,
		collectionID,
	)

	return collectionID, nil
}

func (m *Manager) sendProgress(userID string, progress JobProgress) {
	if m.notify == nil || userID == "" {
		return
	}
	m.notify(userID, ProgressEvent{
		Type:    "import_progress",
		Payload: progress,
	})
}

func JobProgressFromJSON(data []byte) (ProgressEvent, error) {
	var e ProgressEvent
	if err := json.Unmarshal(data, &e); err != nil {
		return e, err
	}
	return e, nil
}
