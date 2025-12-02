package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/search"
)

type SearchHandler struct {
	searchRepo *search.Repository
}

func NewSearchHandler(searchRepo *search.Repository) *SearchHandler {
	return &SearchHandler{searchRepo: searchRepo}
}

func (h *SearchHandler) Search(c *gin.Context) {
	q := search.SearchQuery{
		Text: c.Query("q"),
	}

	if categoryIDs := c.Query("category_ids"); categoryIDs != "" {
		for _, idStr := range strings.Split(categoryIDs, ",") {
			if id, err := strconv.Atoi(strings.TrimSpace(idStr)); err == nil {
				q.CategoryIDs = append(q.CategoryIDs, id)
			}
		}
	}

	if minPrice := c.Query("min_price"); minPrice != "" {
		if price, err := strconv.ParseFloat(minPrice, 64); err == nil {
			q.MinPrice = &price
		}
	}

	if maxPrice := c.Query("max_price"); maxPrice != "" {
		if price, err := strconv.ParseFloat(maxPrice, 64); err == nil {
			q.MaxPrice = &price
		}
	}

	if vendors := c.Query("vendors"); vendors != "" {
		for _, v := range strings.Split(vendors, ",") {
			if trimmed := strings.TrimSpace(v); trimmed != "" {
				q.Vendors = append(q.Vendors, trimmed)
			}
		}
	}

	if available := c.Query("available"); available != "" {
		if b, err := strconv.ParseBool(available); err == nil {
			q.Available = &b
		}
	}

	if limit := c.Query("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 100 {
			q.Limit = l
		}
	}
	if q.Limit == 0 {
		q.Limit = 20
	}

	if offset := c.Query("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			q.Offset = o
		}
	}

	result, err := h.searchRepo.Search(c.Request.Context(), q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"products":     result.Products,
		"total":        result.Total,
		"limit":        q.Limit,
		"offset":       q.Offset,
		"aggregations": result.Aggregations,
	})
}
