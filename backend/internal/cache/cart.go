package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	cartKeyPrefix = "cart:guest:"
	cartTTL       = 7 * 24 * time.Hour // 7 дней
)

type GuestCartItem struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

type CartCache struct {
	rdb *redis.Client
}

func NewCartCache(client *Client) *CartCache {
	return &CartCache{rdb: client.Redis()}
}

func cartKey(sessionID string) string {
	return cartKeyPrefix + sessionID
}

func (c *CartCache) GetCart(ctx context.Context, sessionID string) ([]GuestCartItem, error) {
	data, err := c.rdb.Get(ctx, cartKey(sessionID)).Bytes()
	if err != nil {
		if err == redis.Nil {
			return []GuestCartItem{}, nil // Пустая корзина
		}
		return nil, err
	}

	var items []GuestCartItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func (c *CartCache) SetCart(ctx context.Context, sessionID string, items []GuestCartItem) error {
	data, err := json.Marshal(items)
	if err != nil {
		return err
	}

	return c.rdb.Set(ctx, cartKey(sessionID), data, cartTTL).Err()
}

func (c *CartCache) AddItem(ctx context.Context, sessionID string, productID, quantity int) error {
	items, err := c.GetCart(ctx, sessionID)
	if err != nil {
		return err
	}

	found := false
	for i, item := range items {
		if item.ProductID == productID {
			items[i].Quantity += quantity
			found = true
			break
		}
	}

	if !found {
		items = append(items, GuestCartItem{
			ProductID: productID,
			Quantity:  quantity,
		})
	}

	return c.SetCart(ctx, sessionID, items)
}

func (c *CartCache) UpdateQuantity(ctx context.Context, sessionID string, productID, quantity int) error {
	items, err := c.GetCart(ctx, sessionID)
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
			return c.SetCart(ctx, sessionID, items)
		}
	}

	return fmt.Errorf("product %d not found in cart", productID)
}

func (c *CartCache) RemoveItem(ctx context.Context, sessionID string, productID int) error {
	items, err := c.GetCart(ctx, sessionID)
	if err != nil {
		return err
	}

	for i, item := range items {
		if item.ProductID == productID {
			items = append(items[:i], items[i+1:]...)
			return c.SetCart(ctx, sessionID, items)
		}
	}

	return nil // Товара нет — ничего не делаем
}

func (c *CartCache) Clear(ctx context.Context, sessionID string) error {
	return c.rdb.Del(ctx, cartKey(sessionID)).Err()
}

func (c *CartCache) GetAndClear(ctx context.Context, sessionID string) ([]GuestCartItem, error) {
	items, err := c.GetCart(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	if len(items) > 0 {
		_ = c.Clear(ctx, sessionID)
	}

	return items, nil
}
