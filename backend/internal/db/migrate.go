package db

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"

	"github.com/jackc/pgx/v5"
)

func RunMigrations(ctx context.Context, store *Store, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	var files []fs.DirEntry
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		files = append(files, entry)
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Name() < files[j].Name() })

	txErr := store.WithTx(ctx, func(tx pgx.Tx) error {
		for _, file := range files {
			path := filepath.Join(dir, file.Name())
			content, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, string(content)); err != nil {
				return fmt.Errorf("run migration %s: %w", file.Name(), err)
			}
		}
		return nil
	})
	return txErr
}
