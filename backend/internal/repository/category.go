package repository

import (
	"context"
	"database/sql"

	sq "github.com/Masterminds/squirrel"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type CategoryRepository struct {
	db *sql.DB
	sq sq.StatementBuilderType
}

func NewCategoryRepository(db *sql.DB) *CategoryRepository {
	return &CategoryRepository{
		db: db,
		sq: sq.StatementBuilder.PlaceholderFormat(sq.Dollar),
	}
}

func (r *CategoryRepository) GetAll(ctx context.Context) ([]model.Category, error) {
	query, args, err := r.sq.
		Select("id", "parent_id", "name").
		From("categories").
		OrderBy("name").
		ToSql()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []model.Category
	for rows.Next() {
		var c model.Category
		if err := rows.Scan(&c.ID, &c.ParentID, &c.Name); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}

	return categories, rows.Err()
}

func (r *CategoryRepository) GetByID(ctx context.Context, id int) (*model.Category, error) {
	query, args, err := r.sq.
		Select("id", "parent_id", "name").
		From("categories").
		Where(sq.Eq{"id": id}).
		ToSql()
	if err != nil {
		return nil, err
	}

	var c model.Category
	err = r.db.QueryRowContext(ctx, query, args...).Scan(&c.ID, &c.ParentID, &c.Name)
	if err != nil {
		return nil, err
	}

	return &c, nil
}
