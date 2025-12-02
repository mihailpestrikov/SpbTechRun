package dto

import "github.com/mpstrkv/spbtechrun/internal/model"

type CategoryResponse struct {
	ID       int    `json:"id"`
	ParentID *int   `json:"parent_id,omitempty"`
	Name     string `json:"name"`
}

func CategoryToResponse(c *model.Category) CategoryResponse {
	return CategoryResponse{
		ID:       c.ID,
		ParentID: c.ParentID,
		Name:     c.Name,
	}
}

func CategoriesToResponse(categories []model.Category) []CategoryResponse {
	result := make([]CategoryResponse, len(categories))
	for i, c := range categories {
		result[i] = CategoryToResponse(&c)
	}
	return result
}
