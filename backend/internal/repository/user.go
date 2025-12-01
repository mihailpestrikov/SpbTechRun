package repository

import (
	"context"
	"database/sql"
	"errors"

	sq "github.com/Masterminds/squirrel"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type UserRepository struct {
	db *sql.DB
	sq sq.StatementBuilderType
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{
		db: db,
		sq: sq.StatementBuilder.PlaceholderFormat(sq.Dollar),
	}
}

func (r *UserRepository) Create(ctx context.Context, user *model.User) error {
	query, args, err := r.sq.
		Insert("users").
		Columns("email", "password_hash", "name", "phone").
		Values(user.Email, user.PasswordHash, user.Name, user.Phone).
		Suffix("RETURNING id, created_at").
		ToSql()
	if err != nil {
		return err
	}

	return r.db.QueryRowContext(ctx, query, args...).Scan(&user.ID, &user.CreatedAt)
}

func (r *UserRepository) GetByID(ctx context.Context, id int) (*model.User, error) {
	query, args, err := r.sq.
		Select("id", "email", "password_hash", "name", "phone", "created_at").
		From("users").
		Where(sq.Eq{"id": id}).
		ToSql()
	if err != nil {
		return nil, err
	}

	var u model.User
	err = r.db.QueryRowContext(ctx, query, args...).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Phone, &u.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &u, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	query, args, err := r.sq.
		Select("id", "email", "password_hash", "name", "phone", "created_at").
		From("users").
		Where(sq.Eq{"email": email}).
		ToSql()
	if err != nil {
		return nil, err
	}

	var u model.User
	err = r.db.QueryRowContext(ctx, query, args...).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Phone, &u.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &u, nil
}

func (r *UserRepository) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	query, args, err := r.sq.
		Select("1").
		From("users").
		Where(sq.Eq{"email": email}).
		Limit(1).
		ToSql()
	if err != nil {
		return false, err
	}

	var exists int
	err = r.db.QueryRowContext(ctx, query, args...).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	return true, nil
}
