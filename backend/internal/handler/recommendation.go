package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type RecommendationHandler struct {
	// TODO: добавить HTTP клиент к ML сервису
}

func NewRecommendationHandler() *RecommendationHandler {
	return &RecommendationHandler{}
}

func (h *RecommendationHandler) GetRecommendations(c *gin.Context) {
	productID, err := strconv.Atoi(c.Param("product_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}

	// TODO: запросить рекомендации у ML сервиса
	_ = productID
	c.JSON(http.StatusOK, gin.H{
		"product_id":      productID,
		"recommendations": []any{},
	})
}

func (h *RecommendationHandler) PostFeedback(c *gin.Context) {
	var req struct {
		MainProductID        int    `json:"main_product_id" binding:"required"`
		RecommendedProductID int    `json:"recommended_product_id" binding:"required"`
		Feedback             string `json:"feedback" binding:"required,oneof=positive negative"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: отправить фидбек в ML сервис
	c.JSON(http.StatusOK, gin.H{"message": "feedback received"})
}
