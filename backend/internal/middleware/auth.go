package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/service"
)

const UserIDKey = "user_id"

func Auth(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
			return
		}

		userID, err := authService.ValidateToken(parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		c.Set(UserIDKey, userID)
		c.Next()
	}
}

func GetUserID(c *gin.Context) (int, bool) {
	userID, exists := c.Get(UserIDKey)
	if !exists {
		return 0, false
	}
	id, ok := userID.(int)
	return id, ok
}
