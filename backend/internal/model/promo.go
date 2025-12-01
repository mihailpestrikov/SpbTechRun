package model

import "time"

type Promo struct {
	ID            int
	PromoID       int
	ProductID     int
	PromoType     string
	DiscountPrice float64
	StartDate     time.Time
	EndDate       time.Time
	Description   string
	URL           string
}
