package service

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/mpstrkv/spbtechrun/internal/model"
	"github.com/mpstrkv/spbtechrun/internal/repository"
)

var (
	ErrUserExists         = errors.New("user already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
)

type Claims struct {
	UserID int `json:"user_id"`
	jwt.RegisteredClaims
}

type AuthService struct {
	userRepo  *repository.UserRepository
	jwtSecret []byte
	tokenTTL  time.Duration
}

func NewAuthService(userRepo *repository.UserRepository, jwtSecret string) *AuthService {
	return &AuthService{
		userRepo:  userRepo,
		jwtSecret: []byte(jwtSecret),
		tokenTTL:  24 * time.Hour,
	}
}

func (s *AuthService) Register(ctx context.Context, email, password, name, phone string) (*model.User, string, error) {
	exists, err := s.userRepo.ExistsByEmail(ctx, email)
	if err != nil {
		return nil, "", err
	}
	if exists {
		return nil, "", ErrUserExists
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}

	user := &model.User{
		Email:        email,
		PasswordHash: string(hashedPassword),
		Name:         name,
		Phone:        phone,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, "", err
	}

	token, err := s.generateToken(user.ID)
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*model.User, string, error) {
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, "", ErrInvalidCredentials
		}
		return nil, "", err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", ErrInvalidCredentials
	}

	token, err := s.generateToken(user.ID)
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

func (s *AuthService) ValidateToken(tokenString string) (int, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return 0, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return 0, ErrInvalidToken
	}

	return claims.UserID, nil
}

func (s *AuthService) GetUserByID(ctx context.Context, id int) (*model.User, error) {
	return s.userRepo.GetByID(ctx, id)
}

func (s *AuthService) generateToken(userID int) (string, error) {
	claims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.tokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}
