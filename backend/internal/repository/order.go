package repository

import (
	"context"
	"database/sql"

	sq "github.com/Masterminds/squirrel"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type OrderRepository struct {
	db *sql.DB
	sq sq.StatementBuilderType
}

func NewOrderRepository(db *sql.DB) *OrderRepository {
	return &OrderRepository{
		db: db,
		sq: sq.StatementBuilder.PlaceholderFormat(sq.Dollar),
	}
}

func (r *OrderRepository) Create(ctx context.Context, order *model.Order) error {
	query, args, err := r.sq.
		Insert("orders").
		Columns("user_id", "status", "total", "address").
		Values(order.UserID, order.Status, order.Total, order.Address).
		Suffix("RETURNING id, created_at").
		ToSql()
	if err != nil {
		return err
	}

	return r.db.QueryRowContext(ctx, query, args...).Scan(&order.ID, &order.CreatedAt)
}

func (r *OrderRepository) CreateItems(ctx context.Context, items []model.OrderItem) error {
	if len(items) == 0 {
		return nil
	}

	builder := r.sq.Insert("order_items").Columns("order_id", "product_id", "quantity", "price")

	for _, item := range items {
		builder = builder.Values(item.OrderID, item.ProductID, item.Quantity, item.Price)
	}

	query, args, err := builder.ToSql()
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *OrderRepository) GetByUserID(ctx context.Context, userID int) ([]model.Order, error) {
	query, args, err := r.sq.
		Select("id", "user_id", "status", "total", "address", "created_at").
		From("orders").
		Where(sq.Eq{"user_id": userID}).
		OrderBy("created_at DESC").
		ToSql()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []model.Order
	for rows.Next() {
		var o model.Order
		if err := rows.Scan(&o.ID, &o.UserID, &o.Status, &o.Total, &o.Address, &o.CreatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}

	return orders, rows.Err()
}

func (r *OrderRepository) GetByID(ctx context.Context, id int) (*model.Order, error) {
	query, args, err := r.sq.
		Select("id", "user_id", "status", "total", "address", "created_at").
		From("orders").
		Where(sq.Eq{"id": id}).
		ToSql()
	if err != nil {
		return nil, err
	}

	var o model.Order
	err = r.db.QueryRowContext(ctx, query, args...).Scan(
		&o.ID, &o.UserID, &o.Status, &o.Total, &o.Address, &o.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &o, nil
}

func (r *OrderRepository) GetItemsByOrderID(ctx context.Context, orderID int) ([]model.OrderItem, error) {
	query, args, err := r.sq.
		Select("id", "order_id", "product_id", "quantity", "price").
		From("order_items").
		Where(sq.Eq{"order_id": orderID}).
		ToSql()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.OrderItem
	for rows.Next() {
		var item model.OrderItem
		if err := rows.Scan(&item.ID, &item.OrderID, &item.ProductID, &item.Quantity, &item.Price); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r *OrderRepository) GetItemsByOrderIDs(ctx context.Context, orderIDs []int) (map[int][]model.OrderItem, error) {
	if len(orderIDs) == 0 {
		return make(map[int][]model.OrderItem), nil
	}

	query, args, err := r.sq.
		Select("id", "order_id", "product_id", "quantity", "price").
		From("order_items").
		Where(sq.Eq{"order_id": orderIDs}).
		ToSql()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int][]model.OrderItem)
	for rows.Next() {
		var item model.OrderItem
		if err := rows.Scan(&item.ID, &item.OrderID, &item.ProductID, &item.Quantity, &item.Price); err != nil {
			return nil, err
		}
		result[item.OrderID] = append(result[item.OrderID], item)
	}

	return result, rows.Err()
}
