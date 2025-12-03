package handler

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type RecommendationHandler struct {
	mlURL  string
	client *http.Client
}

func NewRecommendationHandler(mlURL string) *RecommendationHandler {
	return &RecommendationHandler{
		mlURL: mlURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (h *RecommendationHandler) GetRecommendations(c *gin.Context) {
	productID := c.Param("product_id")
	limit := c.DefaultQuery("limit", "20")

	url := fmt.Sprintf("%s/recommendations/%s?limit=%s", h.mlURL, productID, limit)
	h.proxyRequest(c, "GET", url, nil)
}

func (h *RecommendationHandler) PostFeedback(c *gin.Context) {
	url := fmt.Sprintf("%s/feedback", h.mlURL)
	h.proxyRequest(c, "POST", url, c.Request.Body)
}

func (h *RecommendationHandler) GetScenarios(c *gin.Context) {
	url := fmt.Sprintf("%s/scenarios", h.mlURL)
	h.proxyRequest(c, "GET", url, nil)
}

func (h *RecommendationHandler) GetScenario(c *gin.Context) {
	scenarioID := c.Param("scenario_id")
	url := fmt.Sprintf("%s/scenarios/%s", h.mlURL, scenarioID)
	h.proxyRequest(c, "GET", url, nil)
}

func (h *RecommendationHandler) GetScenarioRecommendations(c *gin.Context) {
	scenarioID := c.Param("scenario_id")
	cartProductIDs := c.Query("cart_product_ids")
	limitPerGroup := c.DefaultQuery("limit_per_group", "6")

	url := fmt.Sprintf("%s/scenarios/%s/recommendations?cart_product_ids=%s&limit_per_group=%s",
		h.mlURL, scenarioID, cartProductIDs, limitPerGroup)
	h.proxyRequest(c, "GET", url, nil)
}

func (h *RecommendationHandler) GetAutoScenarioRecommendations(c *gin.Context) {
	cartProductIDs := c.Query("cart_product_ids")
	url := fmt.Sprintf("%s/recommendations/scenario/auto?cart_product_ids=%s", h.mlURL, cartProductIDs)
	h.proxyRequest(c, "GET", url, nil)
}

func (h *RecommendationHandler) GetStats(c *gin.Context) {
	url := fmt.Sprintf("%s/stats", h.mlURL)
	h.proxyRequest(c, "GET", url, nil)
}

func (h *RecommendationHandler) proxyRequest(c *gin.Context, method, url string, body io.Reader) {
	req, err := http.NewRequestWithContext(c.Request.Context(), method, url, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
		return
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := h.client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "ml service unavailable"})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read response"})
		return
	}

	c.Data(resp.StatusCode, "application/json", respBody)
}
