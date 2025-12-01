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
	r.Use(corsMiddleware())
	r.Use(loggerMiddleware())

	categoryRepo := repository.NewCategoryRepository(db)
	productRepo := repository.NewProductRepository(db)
	userRepo := repository.NewUserRepository(db)
	cartRepo := repository.NewCartRepository(db)
	orderRepo := repository.NewOrderRepository(db)

	categoryCache := cache.NewCategoryCache(redisClient)
	cartCache := cache.NewCartCache(redisClient)

	authService := service.NewAuthService(userRepo, jwtSecret)
	cartService := service.NewCartService(cartRepo, productRepo, cartCache)
	orderService := service.NewOrderService(orderRepo, cartRepo, productRepo, cartCache)

	categoryHandler := NewCategoryHandler(categoryRepo, categoryCache)
	productHandler := NewProductHandler(productRepo)
	cartHandler := NewCartHandler(cartService)
	orderHandler := NewOrderHandler(orderService)
	authHandler := NewAuthHandler(authService, cartService)
	recommendationHandler := NewRecommendationHandler()

	authMiddleware := middleware.Auth(authService)
	optionalAuthMiddleware := middleware.OptionalAuth(authService)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	{
		api.GET("/products", productHandler.GetProducts)
		api.GET("/products/:id", productHandler.GetProduct)

		api.GET("/categories", categoryHandler.GetCategories)
		api.GET("/categories/tree", categoryHandler.GetCategoryTree)
		api.GET("/categories/:id", categoryHandler.GetCategory)
		api.GET("/categories/:id/children", categoryHandler.GetCategoryChildren)

		api.POST("/auth/register", authHandler.Register)
		api.POST("/auth/login", authHandler.Login)

		cart := api.Group("")
		cart.Use(optionalAuthMiddleware)
		{
			cart.GET("/cart", cartHandler.GetCart)
			cart.POST("/cart/items", cartHandler.AddToCart)
			cart.PUT("/cart/items/:id", cartHandler.UpdateCartItem)
			cart.DELETE("/cart/items/:id", cartHandler.DeleteCartItem)
			cart.DELETE("/cart", cartHandler.ClearCart)
		}

		protected := api.Group("")
		protected.Use(authMiddleware)
		{
			protected.GET("/auth/profile", authHandler.Profile)

			protected.GET("/orders", orderHandler.GetOrders)
			protected.GET("/orders/:id", orderHandler.GetOrder)
			protected.POST("/orders", orderHandler.CreateOrder)

			protected.POST("/recommendations/feedback", recommendationHandler.PostFeedback)
		}

		api.GET("/recommendations/:product_id", recommendationHandler.GetRecommendations)
	}

	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
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
