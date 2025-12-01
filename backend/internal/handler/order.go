package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/dto"
	"github.com/mpstrkv/spbtechrun/internal/middleware"
	"github.com/mpstrkv/spbtechrun/internal/service"
)

type OrderHandler struct {
	orderService *service.OrderService
}

func NewOrderHandler(orderService *service.OrderService) *OrderHandler {
	return &OrderHandler{orderService: orderService}
}

func (h *OrderHandler) GetOrders(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	orders, err := h.orderService.GetUserOrders(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.OrderResponse, len(orders))
	for i, o := range orders {
		response[i] = dto.OrderToResponse(&o.Order, o.Items, o.Products)
	}

	c.JSON(http.StatusOK, response)
}

func (h *OrderHandler) GetOrder(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	orderID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid order id"})
		return
	}

	order, err := h.orderService.GetOrderByID(c.Request.Context(), userID, orderID)
	if err != nil {
		if errors.Is(err, service.ErrOrderNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		if errors.Is(err, service.ErrNotOrderOwner) {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.OrderToResponse(&order.Order, order.Items, order.Products))
}

func (h *OrderHandler) CreateOrder(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	order, err := h.orderService.CreateOrder(c.Request.Context(), userID)
	if err != nil {
		if errors.Is(err, service.ErrEmptyCart) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cart is empty"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, dto.OrderToResponse(&order.Order, order.Items, order.Products))
}
