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
	"github.com/mpstrkv/spbtechrun/internal/search"
	"github.com/mpstrkv/spbtechrun/internal/service"
)

type RouterDeps struct {
	DB                 *sql.DB
	JWTSecret          string
	RedisClient        *cache.Client
	SearchRepo         *search.Repository
	SearchClient       *search.Client
	ProductRepo        *repository.ProductRepository
	RecommendationsURL string
}

func NewRouter(deps RouterDeps) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
	r.Use(loggerMiddleware())

	categoryRepo := repository.NewCategoryRepository(deps.DB)
	userRepo := repository.NewUserRepository(deps.DB)
	cartRepo := repository.NewCartRepository(deps.DB)
	orderRepo := repository.NewOrderRepository(deps.DB)

	productRepo := deps.ProductRepo

	cartCache := cache.NewCartCache(deps.RedisClient)

	authService := service.NewAuthService(userRepo, deps.JWTSecret)
	cartService := service.NewCartService(cartRepo, productRepo, cartCache)
	orderService := service.NewOrderService(orderRepo, cartRepo, productRepo, cartCache)

	categoryHandler := NewCategoryHandler(categoryRepo)
	productHandler := NewProductHandler(productRepo)
	cartHandler := NewCartHandler(cartService)
	orderHandler := NewOrderHandler(orderService)
	authHandler := NewAuthHandler(authService, cartService)
	recommendationHandler := NewRecommendationHandler(deps.RecommendationsURL)

	var searchHandler *SearchHandler
	if deps.SearchRepo != nil {
		searchHandler = NewSearchHandler(deps.SearchRepo)
	}

	authMiddleware := middleware.Auth(authService)
	optionalAuthMiddleware := middleware.OptionalAuth(authService)

	r.GET("/health", func(c *gin.Context) {
		health := gin.H{
			"status":   "ok",
			"postgres": "ok",
			"redis":    "ok",
		}

		if err := deps.DB.PingContext(c.Request.Context()); err != nil {
			health["status"] = "degraded"
			health["postgres"] = "error"
		}

		if deps.RedisClient != nil {
			if err := deps.RedisClient.Ping(c.Request.Context()); err != nil {
				health["status"] = "degraded"
				health["redis"] = "error"
			}
		}

		if deps.SearchClient != nil {
			if err := deps.SearchClient.Ping(c.Request.Context()); err != nil {
				health["status"] = "degraded"
				health["elasticsearch"] = "error"
			} else {
				health["elasticsearch"] = "ok"
			}
		}

		status := http.StatusOK
		if health["status"] == "degraded" {
			status = http.StatusServiceUnavailable
		}
		c.JSON(status, health)
	})

	api := r.Group("/api")
	{
		if searchHandler != nil {
			api.GET("/search", searchHandler.Search)
		}

		api.GET("/products", productHandler.GetProducts)
		api.GET("/products/:id", productHandler.GetProduct)
		api.POST("/products/:id/view", productHandler.TrackView)

		api.GET("/categories", categoryHandler.GetCategories)
		api.GET("/categories/:id", categoryHandler.GetCategory)

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
		api.GET("/recommendations/scenario/auto", recommendationHandler.GetAutoScenarioRecommendations)
		api.GET("/scenarios", recommendationHandler.GetScenarios)
		api.GET("/scenarios/:scenario_id", recommendationHandler.GetScenario)
		api.GET("/scenarios/:scenario_id/recommendations", recommendationHandler.GetScenarioRecommendations)
		api.POST("/feedback", recommendationHandler.PostFeedback)
		api.POST("/events", recommendationHandler.PostEvent)
		api.POST("/events/batch", recommendationHandler.PostEventsBatch)
		api.GET("/ml/stats", recommendationHandler.GetStats)
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
