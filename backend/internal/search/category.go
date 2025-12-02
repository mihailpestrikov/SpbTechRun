package search

import (
	"context"
	"sync"

	"github.com/mpstrkv/spbtechrun/internal/model"
	"github.com/mpstrkv/spbtechrun/internal/repository"
)

type CategoryPathResolver struct {
	categoryRepo *repository.CategoryRepository
	mu           sync.RWMutex
	categories   map[int]*model.Category
	paths        map[int][]int
	names        map[int]string
}

func NewCategoryPathResolver(categoryRepo *repository.CategoryRepository) *CategoryPathResolver {
	return &CategoryPathResolver{
		categoryRepo: categoryRepo,
		categories:   make(map[int]*model.Category),
		paths:        make(map[int][]int),
		names:        make(map[int]string),
	}
}

func (r *CategoryPathResolver) Load(ctx context.Context) error {
	categories, err := r.categoryRepo.GetAll(ctx)
	if err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.categories = make(map[int]*model.Category)
	r.paths = make(map[int][]int)
	r.names = make(map[int]string)

	for i := range categories {
		cat := &categories[i]
		r.categories[cat.ID] = cat
		r.names[cat.ID] = cat.Name
	}

	for id := range r.categories {
		r.paths[id] = r.buildPath(id)
	}

	return nil
}

func (r *CategoryPathResolver) buildPath(categoryID int) []int {
	var path []int
	current := categoryID

	for {
		path = append([]int{current}, path...)
		cat, ok := r.categories[current]
		if !ok || cat.ParentID == nil {
			break
		}
		current = *cat.ParentID
	}

	return path
}

func (r *CategoryPathResolver) GetPath(categoryID int) []int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if path, ok := r.paths[categoryID]; ok {
		result := make([]int, len(path))
		copy(result, path)
		return result
	}
	return []int{categoryID}
}

func (r *CategoryPathResolver) GetName(categoryID int) string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if name, ok := r.names[categoryID]; ok {
		return name
	}
	return ""
}

func (r *CategoryPathResolver) GetParentID(categoryID int) *int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if cat, ok := r.categories[categoryID]; ok {
		return cat.ParentID
	}
	return nil
}
