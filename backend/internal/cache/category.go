package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/mpstrkv/spbtechrun/internal/dto"
)

const (
	categoryTreeKey = "categories:tree"
	categoryTreeTTL = 1 * time.Hour
)

type CategoryCache struct {
	rdb *redis.Client
}

func NewCategoryCache(client *Client) *CategoryCache {
	return &CategoryCache{rdb: client.Redis()}
}

func (c *CategoryCache) GetTree(ctx context.Context) ([]dto.CategoryTreeResponse, error) {
	data, err := c.rdb.Get(ctx, categoryTreeKey).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, err
	}

	var tree []dto.CategoryTreeResponse
	if err := json.Unmarshal(data, &tree); err != nil {
		return nil, err
	}

	return tree, nil
}

func (c *CategoryCache) SetTree(ctx context.Context, tree []dto.CategoryTreeResponse) error {
	data, err := json.Marshal(tree)
	if err != nil {
		return err
	}

	return c.rdb.Set(ctx, categoryTreeKey, data, categoryTreeTTL).Err()
}

func (c *CategoryCache) Invalidate(ctx context.Context) error {
	return c.rdb.Del(ctx, categoryTreeKey).Err()
}
