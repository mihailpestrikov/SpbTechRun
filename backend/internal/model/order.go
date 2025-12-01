package model

import "time"

type Order struct {
	ID        int
	UserID    int
	Status    string
	Total     float64
	Address   string
	CreatedAt time.Time
}

type OrderItem struct {
	ID        int
	OrderID   int
	ProductID int
	Quantity  int
	Price     float64
}
