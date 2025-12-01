package model

import "time"

type User struct {
	ID           int
	Email        string
	PasswordHash string
	Name         string
	Phone        string
	CreatedAt    time.Time
}
