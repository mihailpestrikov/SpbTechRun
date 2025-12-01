package repository

import (
	"context"
	"database/sql"

	sq "github.com/Masterminds/squirrel"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type ProductRepository struct {
	db *sql.DB
	sq sq.StatementBuilderType
}

func NewProductRepository(db *sql.DB) *ProductRepository {
	return &ProductRepository{
		db: db,
		sq: sq.StatementBuilder.PlaceholderFormat(sq.Dollar),
	}
}

func (r *ProductRepository) GetByID(ctx context.Context, id int) (*model.Product, error) {
	query, args, err := r.sq.
		Select(
			"id", "category_id", "name", "url", "price", "currency",
			"picture", "vendor", "country", "description", "market_description",
			"weight", "available", "params", "created_at",
		).
		From("products").
		Where(sq.Eq{"id": id}).
		ToSql()
	if err != nil {
		return nil, err
	}

	var p model.Product
	err = r.db.QueryRowContext(ctx, query, args...).Scan(
		&p.ID, &p.CategoryID, &p.Name, &p.URL, &p.Price, &p.Currency,
		&p.Picture, &p.Vendor, &p.Country, &p.Description, &p.MarketDescription,
		&p.Weight, &p.Available, &p.Params, &p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &p, nil
}

func (r *ProductRepository) GetByFilter(ctx context.Context, filter model.ProductFilter) ([]model.Product, error) {
	builder := r.sq.
		Select(
			"id", "category_id", "name", "url", "price", "currency",
			"picture", "vendor", "country", "description", "market_description",
			"weight", "available", "params", "created_at",
		).
		From("products")

	if filter.CategoryID != nil {
		builder = builder.Where(sq.Eq{"category_id": *filter.CategoryID})
	}
	if filter.MinPrice != nil {
		builder = builder.Where(sq.GtOrEq{"price": *filter.MinPrice})
	}
	if filter.MaxPrice != nil {
		builder = builder.Where(sq.LtOrEq{"price": *filter.MaxPrice})
	}
	if filter.Vendor != nil {
		builder = builder.Where(sq.Eq{"vendor": *filter.Vendor})
	}
	if filter.Available != nil {
		builder = builder.Where(sq.Eq{"available": *filter.Available})
	}
	if filter.Search != nil {
		builder = builder.Where(sq.ILike{"name": "%" + *filter.Search + "%"})
	}

	if filter.Limit > 0 {
		builder = builder.Limit(uint64(filter.Limit))
	} else {
		builder = builder.Limit(20)
	}
	if filter.Offset > 0 {
		builder = builder.Offset(uint64(filter.Offset))
	}

	builder = builder.OrderBy("id")

	query, args, err := builder.ToSql()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []model.Product
	for rows.Next() {
		var p model.Product
		if err := rows.Scan(
			&p.ID, &p.CategoryID, &p.Name, &p.URL, &p.Price, &p.Currency,
			&p.Picture, &p.Vendor, &p.Country, &p.Description, &p.MarketDescription,
			&p.Weight, &p.Available, &p.Params, &p.CreatedAt,
		); err != nil {
			return nil, err
		}
		products = append(products, p)
	}

	return products, rows.Err()
}

func (r *ProductRepository) GetByCategory(ctx context.Context, categoryID int, limit, offset int) ([]model.Product, error) {
	return r.GetByFilter(ctx, model.ProductFilter{
		CategoryID: &categoryID,
		Limit:      limit,
		Offset:     offset,
	})
}

func (r *ProductRepository) GetByIDs(ctx context.Context, ids []int) (map[int]model.Product, error) {
	if len(ids) == 0 {
		return make(map[int]model.Product), nil
	}

	query, args, err := r.sq.
		Select(
			"id", "category_id", "name", "url", "price", "currency",
			"picture", "vendor", "country", "description", "market_description",
			"weight", "available", "params", "created_at",
		).
		From("products").
		Where(sq.Eq{"id": ids}).
		ToSql()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	products := make(map[int]model.Product)
	for rows.Next() {
		var p model.Product
		if err := rows.Scan(
			&p.ID, &p.CategoryID, &p.Name, &p.URL, &p.Price, &p.Currency,
			&p.Picture, &p.Vendor, &p.Country, &p.Description, &p.MarketDescription,
			&p.Weight, &p.Available, &p.Params, &p.CreatedAt,
		); err != nil {
			return nil, err
		}
		products[p.ID] = p
	}

	return products, rows.Err()
}

func (r *ProductRepository) Count(ctx context.Context, filter model.ProductFilter) (int, error) {
	builder := r.sq.
		Select("COUNT(*)").
		From("products")

	if filter.CategoryID != nil {
		builder = builder.Where(sq.Eq{"category_id": *filter.CategoryID})
	}
	if filter.MinPrice != nil {
		builder = builder.Where(sq.GtOrEq{"price": *filter.MinPrice})
	}
	if filter.MaxPrice != nil {
		builder = builder.Where(sq.LtOrEq{"price": *filter.MaxPrice})
	}
	if filter.Vendor != nil {
		builder = builder.Where(sq.Eq{"vendor": *filter.Vendor})
	}
	if filter.Available != nil {
		builder = builder.Where(sq.Eq{"available": *filter.Available})
	}
	if filter.Search != nil {
		builder = builder.Where(sq.ILike{"name": "%" + *filter.Search + "%"})
	}

	query, args, err := builder.ToSql()
	if err != nil {
		return 0, err
	}

	var count int
	err = r.db.QueryRowContext(ctx, query, args...).Scan(&count)
	return count, err
}
