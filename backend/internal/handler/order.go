package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/dto"
)

type OrderHandler struct {
	// TODO: добавить OrderRepository
}

func NewOrderHandler() *OrderHandler {
	return &OrderHandler{}
}

func (h *OrderHandler) GetOrders(c *gin.Context) {
	// TODO: получить user_id из JWT
	c.JSON(http.StatusOK, []dto.OrderResponse{})
}

func (h *OrderHandler) CreateOrder(c *gin.Context) {
	var req dto.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: создать заказ из корзины
	c.JSON(http.StatusCreated, gin.H{"message": "order created"})
}
