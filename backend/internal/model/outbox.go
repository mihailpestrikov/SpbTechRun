package model

import (
	"encoding/json"
	"time"
)

type OutboxAction string

const (
	OutboxActionCreate OutboxAction = "create"
	OutboxActionUpdate OutboxAction = "update"
	OutboxActionDelete OutboxAction = "delete"
)

type OutboxEvent struct {
	ID          int
	EntityType  string
	EntityID    int
	Action      OutboxAction
	Payload     json.RawMessage
	CreatedAt   time.Time
	ProcessedAt *time.Time
}
