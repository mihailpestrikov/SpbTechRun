package search

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/mpstrkv/spbtechrun/internal/repository"
)

type Components struct {
	Client     *Client
	Repository *Repository
	Worker     *Worker
}

func (c *Components) Stop() {
	if c.Worker != nil {
		c.Worker.Stop()
	}
}

func waitForElasticsearch(ctx context.Context, client *Client, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastErr error

	for time.Now().Before(deadline) {
		if err := client.Ping(ctx); err != nil {
			lastErr = err
			slog.Info("waiting for elasticsearch...", slog.String("error", err.Error()))
			time.Sleep(2 * time.Second)
			continue
		}
		return nil
	}

	return lastErr
}

func Setup(ctx context.Context, elasticURL string, categoryRepo *repository.CategoryRepository, outboxRepo *repository.OutboxRepository, productRepo *repository.ProductRepository) (*Components, error) {
	if elasticURL == "" {
		return nil, fmt.Errorf("ELASTIC_URL is required")
	}

	esClient, err := NewClient(elasticURL)
	if err != nil {
		return nil, fmt.Errorf("failed to create elasticsearch client: %w", err)
	}

	if err := waitForElasticsearch(ctx, esClient, 30*time.Second); err != nil {
		return nil, fmt.Errorf("elasticsearch not available: %w", err)
	}
	slog.Info("elasticsearch connected", slog.String("url", elasticURL))

	categoryPath := NewCategoryPathResolver(categoryRepo)
	if err := categoryPath.Load(ctx); err != nil {
		return nil, fmt.Errorf("failed to load category paths: %w", err)
	}

	repo := NewRepository(esClient, categoryPath)
	if err := repo.EnsureIndex(ctx); err != nil {
		return nil, fmt.Errorf("failed to ensure search index: %w", err)
	}

	indexer := NewIndexer(repo, productRepo, categoryPath)
	if err := indexer.EnsureIndexed(ctx); err != nil {
		return nil, fmt.Errorf("failed to ensure search data: %w", err)
	}

	worker := NewWorker(outboxRepo, productRepo, repo, categoryPath)
	worker.Start(ctx)
	slog.Info("search worker started")

	return &Components{
		Client:     esClient,
		Repository: repo,
		Worker:     worker,
	}, nil
}
