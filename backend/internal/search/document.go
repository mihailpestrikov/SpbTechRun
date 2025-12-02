package search

import "time"

type ProductDocument struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Vendor       string    `json:"vendor"`
	CategoryID   int       `json:"category_id"`
	CategoryPath []int     `json:"category_path"`
	CategoryName string    `json:"category_name"`
	Price        float64   `json:"price"`
	Available    bool      `json:"available"`
	Picture      string    `json:"picture"`
	Country      string    `json:"country"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
