package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/cache"
	"github.com/mpstrkv/spbtechrun/internal/dto"
)

type CartHandler struct {
	cache *cache.CartCache
	// TODO: добавить CartRepository и ProductRepository для авторизованных пользователей
}

func NewCartHandler(cartCache *cache.CartCache) *CartHandler {
	return &CartHandler{cache: cartCache}
}

func (h *CartHandler) GetCart(c *gin.Context) {
	// TODO: получить user_id из JWT или session_id из cookie
	c.JSON(http.StatusOK, dto.CartResponse{
		Items: []dto.CartItemResponse{},
		Total: 0,
	})
}

func (h *CartHandler) AddToCart(c *gin.Context) {
	var req dto.AddToCartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: добавить товар в корзину
	c.JSON(http.StatusCreated, gin.H{"message": "added to cart"})
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

	// TODO: обновить количество
	_ = id
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *CartHandler) DeleteCartItem(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return
	}

	// TODO: удалить из корзины
	_ = id
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
