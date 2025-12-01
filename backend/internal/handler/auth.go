package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/dto"
	"github.com/mpstrkv/spbtechrun/internal/middleware"
	"github.com/mpstrkv/spbtechrun/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Register POST /api/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, token, err := h.authService.Register(c.Request.Context(), req.Email, req.Password, req.Name, req.Phone)
	if err != nil {
		if errors.Is(err, service.ErrUserExists) {
			c.JSON(http.StatusConflict, gin.H{"error": "user with this email already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, dto.AuthResponse{
		Token: token,
		User:  dto.UserToResponse(user),
	})
}

// Login POST /api/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, token, err := h.authService.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "account not found"})
			return
		}
		if errors.Is(err, service.ErrInvalidPassword) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.AuthResponse{
		Token: token,
		User:  dto.UserToResponse(user),
	})
}

// Profile GET /api/auth/profile
func (h *AuthHandler) Profile(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.authService.GetUserByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, dto.UserToResponse(user))
}
