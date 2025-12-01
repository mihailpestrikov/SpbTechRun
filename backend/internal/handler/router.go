package handler

import (
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/repository"
)

func NewRouter(db *sql.DB) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(loggerMiddleware())

	categoryRepo := repository.NewCategoryRepository(db)
	productRepo := repository.NewProductRepository(db)

	categoryHandler := NewCategoryHandler(categoryRepo)
	productHandler := NewProductHandler(productRepo)
	cartHandler := NewCartHandler()
	orderHandler := NewOrderHandler()
	authHandler := NewAuthHandler()
	recommendationHandler := NewRecommendationHandler()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	{
		// Products
		api.GET("/products", productHandler.GetProducts)
		api.GET("/products/:id", productHandler.GetProduct)

		// Categories
		api.GET("/categories", categoryHandler.GetCategories)
		api.GET("/categories/tree", categoryHandler.GetCategoryTree)
		api.GET("/categories/:id", categoryHandler.GetCategory)
		api.GET("/categories/:id/children", categoryHandler.GetCategoryChildren)

		// Cart
		api.GET("/cart", cartHandler.GetCart)
		api.POST("/cart/items", cartHandler.AddToCart)
		api.PUT("/cart/items/:id", cartHandler.UpdateCartItem)
		api.DELETE("/cart/items/:id", cartHandler.DeleteCartItem)

		// Orders
		api.GET("/orders", orderHandler.GetOrders)
		api.POST("/orders", orderHandler.CreateOrder)

		// Auth
		api.POST("/auth/register", authHandler.Register)
		api.POST("/auth/login", authHandler.Login)
		api.GET("/auth/profile", authHandler.Profile)

		// Recommendations
		api.GET("/recommendations/:product_id", recommendationHandler.GetRecommendations)
		api.POST("/recommendations/feedback", recommendationHandler.PostFeedback)
	}

	return r
}

func loggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		slog.Info("request",
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
			slog.Int("status", c.Writer.Status()),
			slog.Duration("latency", time.Since(start)),
		)
	}
}
