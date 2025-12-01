package dto

import (
	"time"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type CartItemResponse struct {
	ID        int              `json:"id"`
	ProductID int              `json:"product_id"`
	Quantity  int              `json:"quantity"`
	AddedAt   time.Time        `json:"added_at"`
	Product   *ProductResponse `json:"product,omitempty"`
}

type CartResponse struct {
	Items []CartItemResponse `json:"items"`
	Total float64            `json:"total"`
}

func CartItemToResponse(item *model.CartItem, product *model.Product) CartItemResponse {
	resp := CartItemResponse{
		ID:        item.ID,
		ProductID: item.ProductID,
		Quantity:  item.Quantity,
		AddedAt:   item.AddedAt,
	}
	if product != nil {
		p := ProductToResponse(product)
		resp.Product = &p
	}
	return resp
}

type AddToCartRequest struct {
	ProductID int `json:"product_id" binding:"required"`
	Quantity  int `json:"quantity" binding:"required,min=1"`
}

type UpdateCartRequest struct {
	Quantity int `json:"quantity" binding:"required,min=1"`
}
