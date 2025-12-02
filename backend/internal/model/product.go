package model

import (
	"encoding/json"
	"time"
)

type Product struct {
	ID                int
	CategoryID        int
	Name              string
	URL               string
	Price             float64
	Currency          string
	Picture           string
	Vendor            string
	Country           string
	Description       string
	MarketDescription string
	Weight            *float64
	Available         bool
	Params            json.RawMessage
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type ProductFilter struct {
	CategoryID *int
	MinPrice   *float64
	MaxPrice   *float64
	Vendor     *string
	Available  *bool
	Search     *string
	Limit      int
	Offset     int
}
