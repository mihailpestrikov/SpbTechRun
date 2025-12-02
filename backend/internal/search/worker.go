package search

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/mpstrkv/spbtechrun/internal/model"
	"github.com/mpstrkv/spbtechrun/internal/repository"
)

type Worker struct {
	outboxRepo      *repository.OutboxRepository
	productRepo     *repository.ProductRepository
	searchRepo      *Repository
	categoryPath    *CategoryPathResolver
	batchSize       int
	pollInterval    time.Duration
	cleanupInterval time.Duration
	cleanupAge      time.Duration
	lastCleanup     time.Time
	stopCh          chan struct{}
	doneCh          chan struct{}
}

func NewWorker(
	outboxRepo *repository.OutboxRepository,
	productRepo *repository.ProductRepository,
	searchRepo *Repository,
	categoryPath *CategoryPathResolver,
) *Worker {
	return &Worker{
		outboxRepo:      outboxRepo,
		productRepo:     productRepo,
		searchRepo:      searchRepo,
		categoryPath:    categoryPath,
		batchSize:       100,
		pollInterval:    2 * time.Second,
		cleanupInterval: 1 * time.Hour,
		cleanupAge:      7 * 24 * time.Hour, // 7 days
		stopCh:          make(chan struct{}),
		doneCh:          make(chan struct{}),
	}
}

func (w *Worker) Start(ctx context.Context) {
	go w.run(ctx)
}

func (w *Worker) Stop() {
	close(w.stopCh)
	<-w.doneCh
}

func (w *Worker) run(ctx context.Context) {
	defer close(w.doneCh)

	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.processBatch(ctx); err != nil {
				slog.Error("outbox worker error", slog.String("error", err.Error()))
			}
			w.maybeCleanup(ctx)
		}
	}
}

func (w *Worker) maybeCleanup(ctx context.Context) {
	if time.Since(w.lastCleanup) < w.cleanupInterval {
		return
	}

	deleted, err := w.outboxRepo.DeleteOld(ctx, w.cleanupAge)
	if err != nil {
		slog.Error("outbox cleanup error", slog.String("error", err.Error()))
		return
	}

	w.lastCleanup = time.Now()
	if deleted > 0 {
		slog.Info("outbox cleanup complete", slog.Int64("deleted", deleted))
	}
}

func (w *Worker) processBatch(ctx context.Context) error {
	events, err := w.outboxRepo.GetPending(ctx, w.batchSize)
	if err != nil {
		return err
	}

	if len(events) == 0 {
		return nil
	}

	var processedIDs []int
	for _, event := range events {
		if event.EntityType != "product" {
			processedIDs = append(processedIDs, event.ID)
			continue
		}

		if err := w.processEvent(ctx, event); err != nil {
			slog.Error("process event failed",
				slog.Int("event_id", event.ID),
				slog.String("action", string(event.Action)),
				slog.String("error", err.Error()),
			)
			continue
		}

		processedIDs = append(processedIDs, event.ID)
	}

	if len(processedIDs) > 0 {
		if err := w.outboxRepo.MarkProcessed(ctx, processedIDs); err != nil {
			return err
		}
		slog.Info("outbox events processed", slog.Int("count", len(processedIDs)))
	}

	return nil
}

func (w *Worker) processEvent(ctx context.Context, event model.OutboxEvent) error {
	switch event.Action {
	case model.OutboxActionCreate, model.OutboxActionUpdate:
		return w.indexProduct(ctx, event)
	case model.OutboxActionDelete:
		return w.searchRepo.DeleteProduct(ctx, event.EntityID)
	default:
		return nil
	}
}

func (w *Worker) indexProduct(ctx context.Context, event model.OutboxEvent) error {
	var product *model.Product

	if len(event.Payload) > 0 {
		product = &model.Product{}
		if err := json.Unmarshal(event.Payload, product); err != nil {
			return err
		}
	} else {
		var err error
		product, err = w.productRepo.GetByID(ctx, event.EntityID)
		if err != nil {
			return err
		}
	}

	doc := w.productToDocument(product)
	return w.searchRepo.IndexProduct(ctx, doc)
}

func (w *Worker) productToDocument(p *model.Product) *ProductDocument {
	return &ProductDocument{
		ID:           p.ID,
		Name:         p.Name,
		Description:  p.Description,
		Vendor:       p.Vendor,
		CategoryID:   p.CategoryID,
		CategoryPath: w.categoryPath.GetPath(p.CategoryID),
		CategoryName: w.categoryPath.GetName(p.CategoryID),
		Price:        p.Price,
		Available:    p.Available,
		Picture:      p.Picture,
		Country:      p.Country,
		CreatedAt:    p.CreatedAt,
		UpdatedAt:    p.UpdatedAt,
	}
}
