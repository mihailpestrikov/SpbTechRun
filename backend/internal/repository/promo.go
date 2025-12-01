package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	sq "github.com/Masterminds/squirrel"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type PromoRepository struct {
	db *sql.DB
	sq sq.StatementBuilderType
}

func NewPromoRepository(db *sql.DB) *PromoRepository {
	return &PromoRepository{
		db: db,
		sq: sq.StatementBuilder.PlaceholderFormat(sq.Dollar),
	}
}

func (r *PromoRepository) GetActivePromos(ctx context.Context) ([]model.Promo, error) {
	now := time.Now()

	query, args, err := r.sq.
		Select("id", "promo_id", "product_id", "promo_type", "discount_price", "start_date", "end_date", "description", "url").
		From("promos").
		Where(sq.LtOrEq{"start_date": now}).
		Where(sq.GtOrEq{"end_date": now}).
		ToSql()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var promos []model.Promo
	for rows.Next() {
		var p model.Promo
		if err := rows.Scan(
			&p.ID, &p.PromoID, &p.ProductID, &p.PromoType, &p.DiscountPrice,
			&p.StartDate, &p.EndDate, &p.Description, &p.URL,
		); err != nil {
			return nil, err
		}
		promos = append(promos, p)
	}

	return promos, rows.Err()
}

func (r *PromoRepository) GetByProductID(ctx context.Context, productID int) (*model.Promo, error) {
	now := time.Now()

	query, args, err := r.sq.
		Select("id", "promo_id", "product_id", "promo_type", "discount_price", "start_date", "end_date", "description", "url").
		From("promos").
		Where(sq.Eq{"product_id": productID}).
		Where(sq.LtOrEq{"start_date": now}).
		Where(sq.GtOrEq{"end_date": now}).
		Limit(1).
		ToSql()
	if err != nil {
		return nil, err
	}

	var p model.Promo
	err = r.db.QueryRowContext(ctx, query, args...).Scan(
		&p.ID, &p.PromoID, &p.ProductID, &p.PromoType, &p.DiscountPrice,
		&p.StartDate, &p.EndDate, &p.Description, &p.URL,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &p, nil
}
