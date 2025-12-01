package repository

import (
	"context"
	"database/sql"
	"errors"

	sq "github.com/Masterminds/squirrel"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type CartRepository struct {
	db *sql.DB
	sq sq.StatementBuilderType
}

func NewCartRepository(db *sql.DB) *CartRepository {
	return &CartRepository{
		db: db,
		sq: sq.StatementBuilder.PlaceholderFormat(sq.Dollar),
	}
}

func (r *CartRepository) GetByUserID(ctx context.Context, userID int) ([]model.CartItem, error) {
	query, args, err := r.sq.
		Select("id", "user_id", "session_id", "product_id", "quantity", "added_at").
		From("cart_items").
		Where(sq.Eq{"user_id": userID}).
		OrderBy("added_at DESC").
		ToSql()
	if err != nil {
		return nil, err
	}

	return r.queryItems(ctx, query, args)
}

func (r *CartRepository) GetBySessionID(ctx context.Context, sessionID string) ([]model.CartItem, error) {
	query, args, err := r.sq.
		Select("id", "user_id", "session_id", "product_id", "quantity", "added_at").
		From("cart_items").
		Where(sq.Eq{"session_id": sessionID}).
		OrderBy("added_at DESC").
		ToSql()
	if err != nil {
		return nil, err
	}

	return r.queryItems(ctx, query, args)
}

func (r *CartRepository) queryItems(ctx context.Context, query string, args []interface{}) ([]model.CartItem, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.CartItem
	for rows.Next() {
		var item model.CartItem
		if err := rows.Scan(
			&item.ID, &item.UserID, &item.SessionID,
			&item.ProductID, &item.Quantity, &item.AddedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r *CartRepository) GetItemByID(ctx context.Context, id int) (*model.CartItem, error) {
	query, args, err := r.sq.
		Select("id", "user_id", "session_id", "product_id", "quantity", "added_at").
		From("cart_items").
		Where(sq.Eq{"id": id}).
		ToSql()
	if err != nil {
		return nil, err
	}

	var item model.CartItem
	err = r.db.QueryRowContext(ctx, query, args...).Scan(
		&item.ID, &item.UserID, &item.SessionID,
		&item.ProductID, &item.Quantity, &item.AddedAt,
	)
	if err != nil {
		return nil, err
	}

	return &item, nil
}

func (r *CartRepository) FindItem(ctx context.Context, userID *int, sessionID *string, productID int) (*model.CartItem, error) {
	builder := r.sq.
		Select("id", "user_id", "session_id", "product_id", "quantity", "added_at").
		From("cart_items").
		Where(sq.Eq{"product_id": productID})

	if userID != nil {
		builder = builder.Where(sq.Eq{"user_id": *userID})
	} else if sessionID != nil {
		builder = builder.Where(sq.Eq{"session_id": *sessionID})
	}

	query, args, err := builder.ToSql()
	if err != nil {
		return nil, err
	}

	var item model.CartItem
	err = r.db.QueryRowContext(ctx, query, args...).Scan(
		&item.ID, &item.UserID, &item.SessionID,
		&item.ProductID, &item.Quantity, &item.AddedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &item, nil
}

func (r *CartRepository) AddItem(ctx context.Context, userID *int, sessionID *string, productID, quantity int) (*model.CartItem, error) {
	query, args, err := r.sq.
		Insert("cart_items").
		Columns("user_id", "session_id", "product_id", "quantity").
		Values(userID, sessionID, productID, quantity).
		Suffix("RETURNING id, user_id, session_id, product_id, quantity, added_at").
		ToSql()
	if err != nil {
		return nil, err
	}

	var item model.CartItem
	err = r.db.QueryRowContext(ctx, query, args...).Scan(
		&item.ID, &item.UserID, &item.SessionID,
		&item.ProductID, &item.Quantity, &item.AddedAt,
	)
	if err != nil {
		return nil, err
	}

	return &item, nil
}

func (r *CartRepository) UpdateQuantity(ctx context.Context, id, quantity int) error {
	query, args, err := r.sq.
		Update("cart_items").
		Set("quantity", quantity).
		Where(sq.Eq{"id": id}).
		ToSql()
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *CartRepository) DeleteItem(ctx context.Context, id int) error {
	query, args, err := r.sq.
		Delete("cart_items").
		Where(sq.Eq{"id": id}).
		ToSql()
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *CartRepository) ClearByUserID(ctx context.Context, userID int) error {
	query, args, err := r.sq.
		Delete("cart_items").
		Where(sq.Eq{"user_id": userID}).
		ToSql()
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *CartRepository) ClearBySessionID(ctx context.Context, sessionID string) error {
	query, args, err := r.sq.
		Delete("cart_items").
		Where(sq.Eq{"session_id": sessionID}).
		ToSql()
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *CartRepository) MergeGuestCart(ctx context.Context, sessionID string, userID int) error {
	guestItems, err := r.GetBySessionID(ctx, sessionID)
	if err != nil {
		return err
	}

	for _, guestItem := range guestItems {
		existingItem, err := r.FindItem(ctx, &userID, nil, guestItem.ProductID)
		if err != nil {
			return err
		}

		if existingItem != nil {
			err = r.UpdateQuantity(ctx, existingItem.ID, existingItem.Quantity+guestItem.Quantity)
		} else {
			_, err = r.AddItem(ctx, &userID, nil, guestItem.ProductID, guestItem.Quantity)
		}
		if err != nil {
			return err
		}
	}

	return r.ClearBySessionID(ctx, sessionID)
}
