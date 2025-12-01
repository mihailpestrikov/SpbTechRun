package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/cache"
	"github.com/mpstrkv/spbtechrun/internal/dto"
	"github.com/mpstrkv/spbtechrun/internal/repository"
)

type CategoryHandler struct {
	repo  *repository.CategoryRepository
	cache *cache.CategoryCache
}

func NewCategoryHandler(repo *repository.CategoryRepository, cache *cache.CategoryCache) *CategoryHandler {
	return &CategoryHandler{repo: repo, cache: cache}
}

func (h *CategoryHandler) GetCategories(c *gin.Context) {
	categories, err := h.repo.GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.CategoriesToResponse(categories))
}

func (h *CategoryHandler) GetCategoryTree(c *gin.Context) {
	ctx := c.Request.Context()

	// Пробуем получить из кэша
	if h.cache != nil {
		tree, err := h.cache.GetTree(ctx)
		if err != nil {
			slog.Warn("failed to get category tree from cache", slog.String("error", err.Error()))
		} else if tree != nil {
			c.JSON(http.StatusOK, tree)
			return
		}
	}

	// Кэш пуст — получаем из БД
	categories, err := h.repo.GetAll(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tree := dto.BuildCategoryTree(categories)

	// Сохраняем в кэш
	if h.cache != nil {
		if err := h.cache.SetTree(ctx, tree); err != nil {
			slog.Warn("failed to cache category tree", slog.String("error", err.Error()))
		}
	}

	c.JSON(http.StatusOK, tree)
}

func (h *CategoryHandler) GetCategory(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category id"})
		return
	}

	category, err := h.repo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}

	c.JSON(http.StatusOK, dto.CategoryToResponse(category))
}

func (h *CategoryHandler) GetCategoryChildren(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category id"})
		return
	}

	children, err := h.repo.GetChildren(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.CategoriesToResponse(children))
}
