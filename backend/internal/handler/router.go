package handler

import (
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/cache"
	"github.com/mpstrkv/spbtechrun/internal/middleware"
	"github.com/mpstrkv/spbtechrun/internal/repository"
	"github.com/mpstrkv/spbtechrun/internal/service"
)

func NewRouter(db *sql.DB, jwtSecret string, redisClient *cache.Client) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(loggerMiddleware())

	// Repositories
	categoryRepo := repository.NewCategoryRepository(db)
	productRepo := repository.NewProductRepository(db)
	userRepo := repository.NewUserRepository(db)

	// Cache
	categoryCache := cache.NewCategoryCache(redisClient)
	cartCache := cache.NewCartCache(redisClient)

	// Services
	authService := service.NewAuthService(userRepo, jwtSecret)

	// Handlers
	categoryHandler := NewCategoryHandler(categoryRepo, categoryCache)
	productHandler := NewProductHandler(productRepo)
	cartHandler := NewCartHandler(cartCache)
	orderHandler := NewOrderHandler()
	authHandler := NewAuthHandler(authService)
	recommendationHandler := NewRecommendationHandler()

	// Middleware
	authMiddleware := middleware.Auth(authService)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	{
		// Products (public)
		api.GET("/products", productHandler.GetProducts)
		api.GET("/products/:id", productHandler.GetProduct)

		// Categories (public)
		api.GET("/categories", categoryHandler.GetCategories)
		api.GET("/categories/tree", categoryHandler.GetCategoryTree)
		api.GET("/categories/:id", categoryHandler.GetCategory)
		api.GET("/categories/:id/children", categoryHandler.GetCategoryChildren)

		// Auth (public)
		api.POST("/auth/register", authHandler.Register)
		api.POST("/auth/login", authHandler.Login)

		// Protected routes
		protected := api.Group("")
		protected.Use(authMiddleware)
		{
			// Profile
			protected.GET("/auth/profile", authHandler.Profile)

			// Cart
			protected.GET("/cart", cartHandler.GetCart)
			protected.POST("/cart/items", cartHandler.AddToCart)
			protected.PUT("/cart/items/:id", cartHandler.UpdateCartItem)
			protected.DELETE("/cart/items/:id", cartHandler.DeleteCartItem)

			// Orders
			protected.GET("/orders", orderHandler.GetOrders)
			protected.POST("/orders", orderHandler.CreateOrder)

			// Recommendations feedback
			protected.POST("/recommendations/feedback", recommendationHandler.PostFeedback)
		}

		// Recommendations (public)
		api.GET("/recommendations/:product_id", recommendationHandler.GetRecommendations)
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
