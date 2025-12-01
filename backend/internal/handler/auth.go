package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/dto"
)

type AuthHandler struct {
	// TODO: добавить UserRepository и JWT secret
}

func NewAuthHandler() *AuthHandler {
	return &AuthHandler{}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: создать пользователя, хэшировать пароль, вернуть токен
	c.JSON(http.StatusCreated, gin.H{"message": "registered"})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: проверить пароль, вернуть токен
	c.JSON(http.StatusOK, gin.H{"message": "logged in"})
}

func (h *AuthHandler) Profile(c *gin.Context) {
	// TODO: получить user_id из JWT, вернуть профиль
	c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
}
