package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func NewRouter() *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(loggerMiddleware())

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	{
		api.GET("/products", notImplemented)
		api.GET("/products/:id", notImplemented)
		api.GET("/products/search", notImplemented)

		api.GET("/categories", notImplemented)
		api.GET("/categories/tree", notImplemented)

		api.GET("/cart", notImplemented)
		api.POST("/cart/items", notImplemented)
		api.PUT("/cart/items/:id", notImplemented)
		api.DELETE("/cart/items/:id", notImplemented)

		api.GET("/orders", notImplemented)
		api.POST("/orders", notImplemented)

		api.POST("/auth/register", notImplemented)
		api.POST("/auth/login", notImplemented)
		api.GET("/auth/me", notImplemented)

		api.GET("/recommendations/:product_id", notImplemented)
		api.POST("/recommendations/feedback", notImplemented)
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

func notImplemented(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}
