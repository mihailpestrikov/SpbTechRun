package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/mpstrkv/spbtechrun/internal/dto"
	"github.com/mpstrkv/spbtechrun/internal/middleware"
	"github.com/mpstrkv/spbtechrun/internal/service"
)

const sessionCookieName = "session_id"

type CartHandler struct {
	cartService *service.CartService
}

func NewCartHandler(cartService *service.CartService) *CartHandler {
	return &CartHandler{cartService: cartService}
}

func (h *CartHandler) getCartOwner(c *gin.Context) (*int, *string) {
	if userID, ok := middleware.GetUserID(c); ok {
		return &userID, nil
	}

	sessionID, err := c.Cookie(sessionCookieName)
	if err != nil || sessionID == "" {
		sessionID = uuid.New().String()
		c.SetCookie(sessionCookieName, sessionID, 60*60*24*30, "/", "", false, true)
	}

	return nil, &sessionID
}

func (h *CartHandler) GetCart(c *gin.Context) {
	userID, sessionID := h.getCartOwner(c)

	cart, err := h.cartService.GetCart(c.Request.Context(), userID, sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	items := make([]dto.CartItemResponse, 0, len(cart.Items))
	for _, item := range cart.Items {
		items = append(items, dto.CartItemToResponse(&item.Item, &item.Product))
	}

	c.JSON(http.StatusOK, dto.CartResponse{
		Items: items,
		Total: cart.Total,
	})
}

func (h *CartHandler) AddToCart(c *gin.Context) {
	var req dto.AddToCartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, sessionID := h.getCartOwner(c)

	item, err := h.cartService.AddItem(c.Request.Context(), userID, sessionID, req.ProductID, req.Quantity)
	if err != nil {
		if errors.Is(err, service.ErrProductNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, dto.CartItemToResponse(item, nil))
}

func (h *CartHandler) UpdateCartItem(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return
	}

	var req dto.UpdateCartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, sessionID := h.getCartOwner(c)

	err = h.cartService.UpdateQuantity(c.Request.Context(), userID, sessionID, id, req.Quantity)
	if err != nil {
		if errors.Is(err, service.ErrCartItemNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "cart item not found"})
			return
		}
		if errors.Is(err, service.ErrUnauthorized) {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *CartHandler) DeleteCartItem(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return
	}

	userID, sessionID := h.getCartOwner(c)

	err = h.cartService.RemoveItem(c.Request.Context(), userID, sessionID, id)
	if err != nil {
		if errors.Is(err, service.ErrCartItemNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "cart item not found"})
			return
		}
		if errors.Is(err, service.ErrUnauthorized) {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *CartHandler) ClearCart(c *gin.Context) {
	userID, sessionID := h.getCartOwner(c)

	err := h.cartService.ClearCart(c.Request.Context(), userID, sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "cart cleared"})
}
