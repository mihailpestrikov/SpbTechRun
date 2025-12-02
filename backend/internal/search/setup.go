package search

import (
	"context"
	"log/slog"

	"github.com/mpstrkv/spbtechrun/internal/repository"
)

type Components struct {
	Repository *Repository
	Worker     *Worker
}

func (c *Components) Stop() {
	if c.Worker != nil {
		c.Worker.Stop()
	}
}

func Setup(ctx context.Context, elasticURL string, categoryRepo *repository.CategoryRepository, outboxRepo *repository.OutboxRepository, productRepo *repository.ProductRepository) *Components {
	if elasticURL == "" {
		return nil
	}

	esClient, err := NewClient(elasticURL)
	if err != nil {
		slog.Warn("failed to create elasticsearch client", slog.String("error", err.Error()))
		return nil
	}

	if err := esClient.Ping(ctx); err != nil {
		slog.Warn("elasticsearch not available, search disabled", slog.String("error", err.Error()))
		return nil
	}
	slog.Info("elasticsearch connected", slog.String("url", elasticURL))

	categoryPath := NewCategoryPathResolver(categoryRepo)
	if err := categoryPath.Load(ctx); err != nil {
		slog.Error("failed to load category paths", slog.String("error", err.Error()))
		return nil
	}

	repo := NewRepository(esClient, categoryPath)
	if err := repo.EnsureIndex(ctx); err != nil {
		slog.Error("failed to ensure search index", slog.String("error", err.Error()))
		return nil
	}

	indexer := NewIndexer(repo, productRepo, categoryPath)
	if err := indexer.EnsureIndexed(ctx); err != nil {
		slog.Error("failed to ensure search data", slog.String("error", err.Error()))
	}

	worker := NewWorker(outboxRepo, productRepo, repo, categoryPath)
	worker.Start(ctx)
	slog.Info("search worker started")

	return &Components{
		Repository: repo,
		Worker:     worker,
	}
}
