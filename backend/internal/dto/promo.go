package dto

import "time"

// PromoCache - структура для хранения в Redis
type PromoCache struct {
	DiscountPrice float64   `json:"discount_price"`
	EndDate       time.Time `json:"end_date"`
	PromoType     string    `json:"promo_type"`
}
