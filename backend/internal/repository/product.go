package repository

import (
	"context"
	"database/sql"
	"time"

	sq "github.com/Masterminds/squirrel"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

const entityTypeProduct = "product"

type ProductRepository struct {
	db         *sql.DB
	sq         sq.StatementBuilderType
	outboxRepo *OutboxRepository
}

func NewProductRepository(db *sql.DB, outboxRepo *OutboxRepository) *ProductRepository {
	return &ProductRepository{
		db:         db,
		sq:         sq.StatementBuilder.PlaceholderFormat(sq.Dollar),
		outboxRepo: outboxRepo,
	}
}

func (r *ProductRepository) DB() *sql.DB {
	return r.db
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

func (r *ProductRepository) GetAll(ctx context.Context) ([]model.Product, error) {
	query, args, err := r.sq.
		Select(
			"id", "category_id", "COALESCE(name, '')", "COALESCE(url, '')", "COALESCE(price, 0)", "COALESCE(currency, '')",
			"COALESCE(picture, '')", "COALESCE(vendor, '')", "COALESCE(country, '')", "COALESCE(description, '')", "COALESCE(market_description, '')",
			"weight", "COALESCE(available, false)", "params", "created_at", "COALESCE(updated_at, created_at)",
		).
		From("products").
		OrderBy("id").
		ToSql()
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
			&p.Weight, &p.Available, &p.Params, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		products = append(products, p)
	}

	return products, rows.Err()
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

func (r *ProductRepository) Create(ctx context.Context, p *model.Product) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := r.CreateTx(ctx, tx, p); err != nil {
		return err
	}

	if err := r.outboxRepo.CreateTx(ctx, tx, entityTypeProduct, p.ID, model.OutboxActionCreate, p); err != nil {
		return err
	}

	return tx.Commit()
}

func (r *ProductRepository) CreateTx(ctx context.Context, q Querier, p *model.Product) error {
	now := time.Now()
	p.CreatedAt = now
	p.UpdatedAt = now

	query, args, err := r.sq.
		Insert("products").
		Columns(
			"id", "category_id", "name", "url", "price", "currency",
			"picture", "vendor", "country", "description", "market_description",
			"weight", "available", "params", "created_at", "updated_at",
		).
		Values(
			p.ID, p.CategoryID, p.Name, p.URL, p.Price, p.Currency,
			p.Picture, p.Vendor, p.Country, p.Description, p.MarketDescription,
			p.Weight, p.Available, p.Params, p.CreatedAt, p.UpdatedAt,
		).
		ToSql()
	if err != nil {
		return err
	}

	_, err = q.ExecContext(ctx, query, args...)
	return err
}

func (r *ProductRepository) Update(ctx context.Context, p *model.Product) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := r.UpdateTx(ctx, tx, p); err != nil {
		return err
	}

	if err := r.outboxRepo.CreateTx(ctx, tx, entityTypeProduct, p.ID, model.OutboxActionUpdate, p); err != nil {
		return err
	}

	return tx.Commit()
}

func (r *ProductRepository) UpdateTx(ctx context.Context, q Querier, p *model.Product) error {
	p.UpdatedAt = time.Now()

	query, args, err := r.sq.
		Update("products").
		Set("category_id", p.CategoryID).
		Set("name", p.Name).
		Set("url", p.URL).
		Set("price", p.Price).
		Set("currency", p.Currency).
		Set("picture", p.Picture).
		Set("vendor", p.Vendor).
		Set("country", p.Country).
		Set("description", p.Description).
		Set("market_description", p.MarketDescription).
		Set("weight", p.Weight).
		Set("available", p.Available).
		Set("params", p.Params).
		Set("updated_at", p.UpdatedAt).
		Where(sq.Eq{"id": p.ID}).
		ToSql()
	if err != nil {
		return err
	}

	_, err = q.ExecContext(ctx, query, args...)
	return err
}

func (r *ProductRepository) Delete(ctx context.Context, id int) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := r.DeleteTx(ctx, tx, id); err != nil {
		return err
	}

	if err := r.outboxRepo.CreateTx(ctx, tx, entityTypeProduct, id, model.OutboxActionDelete, nil); err != nil {
		return err
	}

	return tx.Commit()
}

func (r *ProductRepository) DeleteTx(ctx context.Context, q Querier, id int) error {
	query, args, err := r.sq.
		Delete("products").
		Where(sq.Eq{"id": id}).
		ToSql()
	if err != nil {
		return err
	}

	_, err = q.ExecContext(ctx, query, args...)
	return err
}

func (r *ProductRepository) IncrementViewCount(ctx context.Context, productID int) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO product_stats (product_id, view_count)
		VALUES ($1, 1)
		ON CONFLICT (product_id)
		DO UPDATE SET view_count = product_stats.view_count + 1, updated_at = NOW()
	`, productID)
	return err
}

func (r *ProductRepository) IncrementCartAddCount(ctx context.Context, productID int) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO product_stats (product_id, cart_add_count)
		VALUES ($1, 1)
		ON CONFLICT (product_id)
		DO UPDATE SET cart_add_count = product_stats.cart_add_count + 1, updated_at = NOW()
	`, productID)
	return err
}

func (r *ProductRepository) IncrementOrderCount(ctx context.Context, productIDs []int) error {
	if len(productIDs) == 0 {
		return nil
	}
	for _, id := range productIDs {
		_, err := r.db.ExecContext(ctx, `
			INSERT INTO product_stats (product_id, order_count)
			VALUES ($1, 1)
			ON CONFLICT (product_id)
			DO UPDATE SET order_count = product_stats.order_count + 1, updated_at = NOW()
		`, id)
		if err != nil {
			return err
		}
	}
	return nil
}
