package model

import "time"

type CartItem struct {
	ID        int
	UserID    *int
	SessionID *string
	ProductID int
	Quantity  int
	AddedAt   time.Time
}
