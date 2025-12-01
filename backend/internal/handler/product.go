package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/dto"
	"github.com/mpstrkv/spbtechrun/internal/model"
	"github.com/mpstrkv/spbtechrun/internal/repository"
)

type ProductHandler struct {
	repo *repository.ProductRepository
}

func NewProductHandler(repo *repository.ProductRepository) *ProductHandler {
	return &ProductHandler{repo: repo}
}

func (h *ProductHandler) GetProducts(c *gin.Context) {
	filter := model.ProductFilter{
		Limit:  20,
		Offset: 0,
	}

	if v := c.Query("category_id"); v != "" {
		if id, err := strconv.Atoi(v); err == nil {
			filter.CategoryID = &id
		}
	}
	if v := c.Query("min_price"); v != "" {
		if price, err := strconv.ParseFloat(v, 64); err == nil {
			filter.MinPrice = &price
		}
	}
	if v := c.Query("max_price"); v != "" {
		if price, err := strconv.ParseFloat(v, 64); err == nil {
			filter.MaxPrice = &price
		}
	}
	if v := c.Query("vendor"); v != "" {
		filter.Vendor = &v
	}
	if v := c.Query("available"); v != "" {
		available := v == "true" || v == "1"
		filter.Available = &available
	}
	if v := c.Query("search"); v != "" {
		filter.Search = &v
	}
	if v := c.Query("limit"); v != "" {
		if limit, err := strconv.Atoi(v); err == nil && limit > 0 && limit <= 100 {
			filter.Limit = limit
		}
	}
	if v := c.Query("offset"); v != "" {
		if offset, err := strconv.Atoi(v); err == nil && offset >= 0 {
			filter.Offset = offset
		}
	}

	products, err := h.repo.GetByFilter(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	total, err := h.repo.Count(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.ProductListResponse{
		Products: dto.ProductsToResponse(products),
		Total:    total,
		Limit:    filter.Limit,
		Offset:   filter.Offset,
	})
}

func (h *ProductHandler) GetProduct(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}

	product, err := h.repo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
		return
	}

	c.JSON(http.StatusOK, dto.ProductToResponse(product))
}
