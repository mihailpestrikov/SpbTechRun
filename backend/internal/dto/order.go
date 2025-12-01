package dto

import (
	"time"

	"github.com/mpstrkv/spbtechrun/internal/model"
)

type OrderItemResponse struct {
	ID        int              `json:"id"`
	ProductID int              `json:"product_id"`
	Quantity  int              `json:"quantity"`
	Price     float64          `json:"price"`
	Product   *ProductResponse `json:"product,omitempty"`
}

type OrderResponse struct {
	ID        int                 `json:"id"`
	Status    string              `json:"status"`
	Total     float64             `json:"total"`
	Address   string              `json:"address,omitempty"`
	CreatedAt time.Time           `json:"created_at"`
	Items     []OrderItemResponse `json:"items,omitempty"`
}

func OrderToResponse(o *model.Order, items []model.OrderItem, products map[int]*model.Product) OrderResponse {
	resp := OrderResponse{
		ID:        o.ID,
		Status:    o.Status,
		Total:     o.Total,
		Address:   o.Address,
		CreatedAt: o.CreatedAt,
		Items:     make([]OrderItemResponse, len(items)),
	}

	for i, item := range items {
		itemResp := OrderItemResponse{
			ID:        item.ID,
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
			Price:     item.Price,
		}
		if p, ok := products[item.ProductID]; ok {
			pr := ProductToResponse(p)
			itemResp.Product = &pr
		}
		resp.Items[i] = itemResp
	}

	return resp
}

type CreateOrderRequest struct {
	Address string `json:"address" binding:"required"`
}
