package dto

import (
	"encoding/json"
	"time"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type ProductResponse struct {
	ID                int             `json:"id"`
	CategoryID        int             `json:"category_id"`
	Name              string          `json:"name"`
	URL               string          `json:"url,omitempty"`
	Price             float64         `json:"price"`
	Currency          string          `json:"currency"`
	Picture           string          `json:"picture,omitempty"`
	Vendor            string          `json:"vendor,omitempty"`
	Country           string          `json:"country,omitempty"`
	Description       string          `json:"description,omitempty"`
	MarketDescription string          `json:"market_description,omitempty"`
	Weight            *float64        `json:"weight,omitempty"`
	Available         bool            `json:"available"`
	Params            json.RawMessage `json:"params,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`

	// Из Redis кэша скидок
	DiscountPrice *float64   `json:"discount_price,omitempty"`
	DiscountEnds  *time.Time `json:"discount_ends,omitempty"`
}

func ProductToResponse(p *model.Product) ProductResponse {
	return ProductResponse{
		ID:                p.ID,
		CategoryID:        p.CategoryID,
		Name:              p.Name,
		URL:               p.URL,
		Price:             p.Price,
		Currency:          p.Currency,
		Picture:           p.Picture,
		Vendor:            p.Vendor,
		Country:           p.Country,
		Description:       p.Description,
		MarketDescription: p.MarketDescription,
		Weight:            p.Weight,
		Available:         p.Available,
		Params:            p.Params,
		CreatedAt:         p.CreatedAt,
	}
}

func ProductsToResponse(products []model.Product) []ProductResponse {
	result := make([]ProductResponse, len(products))
	for i, p := range products {
		result[i] = ProductToResponse(&p)
	}
	return result
}

type ProductListResponse struct {
	Products []ProductResponse `json:"products"`
	Total    int               `json:"total"`
	Limit    int               `json:"limit"`
	Offset   int               `json:"offset"`
}
