package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	sq "github.com/Masterminds/squirrel"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type OutboxRepository struct {
	db *sql.DB
	sq sq.StatementBuilderType
}

func NewOutboxRepository(db *sql.DB) *OutboxRepository {
	return &OutboxRepository{
		db: db,
		sq: sq.StatementBuilder.PlaceholderFormat(sq.Dollar),
	}
}

func (r *OutboxRepository) Create(ctx context.Context, entityType string, entityID int, action model.OutboxAction, payload interface{}) error {
	return r.CreateTx(ctx, r.db, entityType, entityID, action, payload)
}

func (r *OutboxRepository) CreateTx(ctx context.Context, q Querier, entityType string, entityID int, action model.OutboxAction, payload interface{}) error {
	var payloadJSON []byte
	var err error

	if payload != nil {
		payloadJSON, err = json.Marshal(payload)
		if err != nil {
			return err
		}
	}

	query, args, err := r.sq.
		Insert("outbox").
		Columns("entity_type", "entity_id", "action", "payload").
		Values(entityType, entityID, action, payloadJSON).
		ToSql()
	if err != nil {
		return err
	}

	_, err = q.ExecContext(ctx, query, args...)
	return err
}

func (r *OutboxRepository) GetPending(ctx context.Context, limit int) ([]model.OutboxEvent, error) {
	query, args, err := r.sq.
		Select("id", "entity_type", "entity_id", "action", "payload", "created_at").
		From("outbox").
		Where(sq.Eq{"processed_at": nil}).
		OrderBy("created_at ASC").
		Limit(uint64(limit)).
		ToSql()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []model.OutboxEvent
	for rows.Next() {
		var e model.OutboxEvent
		if err := rows.Scan(&e.ID, &e.EntityType, &e.EntityID, &e.Action, &e.Payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	return events, rows.Err()
}

func (r *OutboxRepository) MarkProcessed(ctx context.Context, ids []int) error {
	if len(ids) == 0 {
		return nil
	}

	query, args, err := r.sq.
		Update("outbox").
		Set("processed_at", time.Now()).
		Where(sq.Eq{"id": ids}).
		ToSql()
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *OutboxRepository) DeleteOld(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan)

	query, args, err := r.sq.
		Delete("outbox").
		Where(sq.Lt{"processed_at": cutoff}).
		Where(sq.NotEq{"processed_at": nil}).
		ToSql()
	if err != nil {
		return 0, err
	}

	result, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected()
}
