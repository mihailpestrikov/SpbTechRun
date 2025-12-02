package search

import (
	"context"
	"log/slog"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type ProductLoader interface {
	GetAll(ctx context.Context) ([]model.Product, error)
}

type Indexer struct {
	repo         *Repository
	productRepo  ProductLoader
	categoryPath *CategoryPathResolver
	batchSize    int
}

func NewIndexer(repo *Repository, productRepo ProductLoader, categoryPath *CategoryPathResolver) *Indexer {
	return &Indexer{
		repo:         repo,
		productRepo:  productRepo,
		categoryPath: categoryPath,
		batchSize:    500,
	}
}

func (idx *Indexer) EnsureIndexed(ctx context.Context) error {
	count, err := idx.repo.GetDocumentCount(ctx)
	if err != nil {
		return err
	}

	if count > 0 {
		slog.Info("search index already populated", slog.Int64("documents", count))
		return nil
	}

	slog.Info("search index is empty, starting initial indexing...")
	return idx.Reindex(ctx)
}

func (idx *Indexer) Reindex(ctx context.Context) error {
	products, err := idx.productRepo.GetAll(ctx)
	if err != nil {
		return err
	}
	slog.Info("loaded products from database", slog.Int("count", len(products)))

	docs := make([]ProductDocument, 0, len(products))
	for _, p := range products {
		docs = append(docs, idx.productToDocument(&p))
	}

	for i := 0; i < len(docs); i += idx.batchSize {
		end := i + idx.batchSize
		if end > len(docs) {
			end = len(docs)
		}
		if err := idx.repo.BulkIndex(ctx, docs[i:end]); err != nil {
			return err
		}
		slog.Info("indexed batch", slog.Int("from", i), slog.Int("to", end))
	}

	if err := idx.repo.Refresh(ctx); err != nil {
		return err
	}

	slog.Info("initial indexing complete", slog.Int("total", len(docs)))
	return nil
}

func (idx *Indexer) productToDocument(p *model.Product) ProductDocument {
	return ProductDocument{
		ID:           p.ID,
		Name:         p.Name,
		Description:  p.Description,
		Vendor:       p.Vendor,
		CategoryID:   p.CategoryID,
		CategoryPath: idx.categoryPath.GetPath(p.CategoryID),
		CategoryName: idx.categoryPath.GetName(p.CategoryID),
		Price:        p.Price,
		Available:    p.Available,
		Picture:      p.Picture,
		Country:      p.Country,
		CreatedAt:    p.CreatedAt,
		UpdatedAt:    p.UpdatedAt,
	}
}
