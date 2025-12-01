package dto

import "github.com/mpstrkv/spbtechrun/internal/model"

type CategoryResponse struct {
	ID       int    `json:"id"`
	ParentID *int   `json:"parent_id,omitempty"`
	Name     string `json:"name"`
}

type CategoryTreeResponse struct {
	ID       int                    `json:"id"`
	ParentID *int                   `json:"parent_id,omitempty"`
	Name     string                 `json:"name"`
	Children []CategoryTreeResponse `json:"children,omitempty"`
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

// BuildCategoryTree BuildTree строит дерево категорий из плоского списка
func BuildCategoryTree(categories []model.Category) []CategoryTreeResponse {
	categoryMap := make(map[int]*CategoryTreeResponse)
	var roots []CategoryTreeResponse

	// Создаём map всех категорий
	for _, c := range categories {
		categoryMap[c.ID] = &CategoryTreeResponse{
			ID:       c.ID,
			ParentID: c.ParentID,
			Name:     c.Name,
			Children: []CategoryTreeResponse{},
		}
	}

	// Строим дерево
	for _, c := range categories {
		node := categoryMap[c.ID]
		if c.ParentID == nil {
			roots = append(roots, *node)
		} else {
			parent, ok := categoryMap[*c.ParentID]
			if ok {
				parent.Children = append(parent.Children, *node)
			}
		}
	}

	return roots
}
