package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	guestCartKeyPrefix = "cart:guest:"
	userCartKeyPrefix  = "cart:user:"
	guestCartTTL       = 30 * 24 * time.Hour
	userCartTTL        = 1 * time.Hour
)

type CartItem struct {
	ID        int `json:"id,omitempty"`
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

type CartCache struct {
	rdb *redis.Client
}

func NewCartCache(client *Client) *CartCache {
	return &CartCache{rdb: client.Redis()}
}

func guestCartKey(sessionID string) string {
	return guestCartKeyPrefix + sessionID
}

func (c *CartCache) GetGuestCart(ctx context.Context, sessionID string) ([]CartItem, error) {
	data, err := c.rdb.Get(ctx, guestCartKey(sessionID)).Bytes()
	if err != nil {
		if err == redis.Nil {
			return []CartItem{}, nil
		}
		return nil, err
	}

	var items []CartItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func (c *CartCache) SetGuestCart(ctx context.Context, sessionID string, items []CartItem) error {
	data, err := json.Marshal(items)
	if err != nil {
		return err
	}

	return c.rdb.Set(ctx, guestCartKey(sessionID), data, guestCartTTL).Err()
}

func (c *CartCache) AddGuestItem(ctx context.Context, sessionID string, productID, quantity int) error {
	items, err := c.GetGuestCart(ctx, sessionID)
	if err != nil {
		return err
	}

	for i, item := range items {
		if item.ProductID == productID {
			items[i].Quantity += quantity
			return c.SetGuestCart(ctx, sessionID, items)
		}
	}

	items = append(items, CartItem{
		ProductID: productID,
		Quantity:  quantity,
	})

	return c.SetGuestCart(ctx, sessionID, items)
}

func (c *CartCache) UpdateGuestQuantity(ctx context.Context, sessionID string, productID, quantity int) error {
	items, err := c.GetGuestCart(ctx, sessionID)
	if err != nil {
		return err
	}

	for i, item := range items {
		if item.ProductID == productID {
			if quantity <= 0 {
				items = append(items[:i], items[i+1:]...)
			} else {
				items[i].Quantity = quantity
			}
			return c.SetGuestCart(ctx, sessionID, items)
		}
	}

	return fmt.Errorf("product %d not found in cart", productID)
}

func (c *CartCache) RemoveGuestItem(ctx context.Context, sessionID string, productID int) error {
	items, err := c.GetGuestCart(ctx, sessionID)
	if err != nil {
		return err
	}

	for i, item := range items {
		if item.ProductID == productID {
			items = append(items[:i], items[i+1:]...)
			return c.SetGuestCart(ctx, sessionID, items)
		}
	}

	return nil
}

func (c *CartCache) ClearGuestCart(ctx context.Context, sessionID string) error {
	return c.rdb.Del(ctx, guestCartKey(sessionID)).Err()
}

func (c *CartCache) GetAndClearGuestCart(ctx context.Context, sessionID string) ([]CartItem, error) {
	items, err := c.GetGuestCart(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	if len(items) > 0 {
		_ = c.ClearGuestCart(ctx, sessionID)
	}

	return items, nil
}

func userCartKey(userID int) string {
	return fmt.Sprintf("%s%d", userCartKeyPrefix, userID)
}

func (c *CartCache) GetUserCart(ctx context.Context, userID int) ([]CartItem, error) {
	data, err := c.rdb.Get(ctx, userCartKey(userID)).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, nil
		}
		return nil, err
	}

	var items []CartItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func (c *CartCache) SetUserCart(ctx context.Context, userID int, items []CartItem) error {
	data, err := json.Marshal(items)
	if err != nil {
		return err
	}

	return c.rdb.Set(ctx, userCartKey(userID), data, userCartTTL).Err()
}

func (c *CartCache) InvalidateUserCart(ctx context.Context, userID int) error {
	return c.rdb.Del(ctx, userCartKey(userID)).Err()
}
