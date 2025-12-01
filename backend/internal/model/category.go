package model

type Category struct {
	ID       int
	ParentID *int
	Name     string
}
