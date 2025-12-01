package service

import (
	"context"
	"errors"

	"github.com/mpstrkv/spbtechrun/internal/cache"
	"github.com/mpstrkv/spbtechrun/internal/model"
	"github.com/mpstrkv/spbtechrun/internal/repository"
)

var (
	ErrProductNotFound  = errors.New("product not found")
	ErrCartItemNotFound = errors.New("cart item not found")
	ErrUnauthorized     = errors.New("unauthorized")
)

type CartService struct {
	cartRepo    *repository.CartRepository
	productRepo *repository.ProductRepository
	cartCache   *cache.CartCache
}

func NewCartService(cartRepo *repository.CartRepository, productRepo *repository.ProductRepository, cartCache *cache.CartCache) *CartService {
	return &CartService{
		cartRepo:    cartRepo,
		productRepo: productRepo,
		cartCache:   cartCache,
	}
}

type CartItemWithProduct struct {
	Item    model.CartItem
	Product model.Product
}

type CartWithTotal struct {
	Items []CartItemWithProduct
	Total float64
}

func (s *CartService) GetCart(ctx context.Context, userID *int, sessionID *string) (*CartWithTotal, error) {
	result := &CartWithTotal{
		Items: make([]CartItemWithProduct, 0),
		Total: 0,
	}

	if userID == nil && sessionID != nil {
		guestItems, err := s.cartCache.GetGuestCart(ctx, *sessionID)
		if err != nil {
			return nil, err
		}

		for _, item := range guestItems {
			product, err := s.productRepo.GetByID(ctx, item.ProductID)
			if err != nil {
				continue
			}

			result.Items = append(result.Items, CartItemWithProduct{
				Item: model.CartItem{
					ProductID: item.ProductID,
					Quantity:  item.Quantity,
					SessionID: sessionID,
				},
				Product: *product,
			})
			result.Total += product.Price * float64(item.Quantity)
		}
		return result, nil
	}

	if userID != nil {
		cachedItems, err := s.cartCache.GetUserCart(ctx, *userID)
		if err == nil && cachedItems != nil {
			for _, item := range cachedItems {
				product, err := s.productRepo.GetByID(ctx, item.ProductID)
				if err != nil {
					continue
				}

				result.Items = append(result.Items, CartItemWithProduct{
					Item: model.CartItem{
						ID:        item.ID,
						UserID:    userID,
						ProductID: item.ProductID,
						Quantity:  item.Quantity,
					},
					Product: *product,
				})
				result.Total += product.Price * float64(item.Quantity)
			}
			return result, nil
		}

		items, err := s.cartRepo.GetByUserID(ctx, *userID)
		if err != nil {
			return nil, err
		}

		cacheItems := make([]cache.CartItem, 0, len(items))
		for _, item := range items {
			product, err := s.productRepo.GetByID(ctx, item.ProductID)
			if err != nil {
				continue
			}

			result.Items = append(result.Items, CartItemWithProduct{
				Item:    item,
				Product: *product,
			})
			result.Total += product.Price * float64(item.Quantity)

			cacheItems = append(cacheItems, cache.CartItem{
				ID:        item.ID,
				ProductID: item.ProductID,
				Quantity:  item.Quantity,
			})
		}

		if len(cacheItems) > 0 {
			_ = s.cartCache.SetUserCart(ctx, *userID, cacheItems)
		}

		return result, nil
	}

	return result, nil
}

func (s *CartService) AddItem(ctx context.Context, userID *int, sessionID *string, productID, quantity int) (*model.CartItem, error) {
	product, err := s.productRepo.GetByID(ctx, productID)
	if err != nil {
		return nil, ErrProductNotFound
	}
	if !product.Available {
		return nil, ErrProductNotFound
	}

	if userID == nil && sessionID != nil {
		if err := s.cartCache.AddGuestItem(ctx, *sessionID, productID, quantity); err != nil {
			return nil, err
		}
		return &model.CartItem{
			ProductID: productID,
			Quantity:  quantity,
			SessionID: sessionID,
		}, nil
	}

	if userID != nil {
		existingItem, err := s.cartRepo.FindItem(ctx, userID, nil, productID)
		if err != nil {
			return nil, err
		}

		var result *model.CartItem
		if existingItem != nil {
			newQuantity := existingItem.Quantity + quantity
			if err := s.cartRepo.UpdateQuantity(ctx, existingItem.ID, newQuantity); err != nil {
				return nil, err
			}
			existingItem.Quantity = newQuantity
			result = existingItem
		} else {
			result, err = s.cartRepo.AddItem(ctx, userID, nil, productID, quantity)
			if err != nil {
				return nil, err
			}
		}

		_ = s.cartCache.InvalidateUserCart(ctx, *userID)
		return result, nil
	}

	return nil, ErrUnauthorized
}

func (s *CartService) UpdateQuantity(ctx context.Context, userID *int, sessionID *string, itemID, quantity int) error {
	if userID == nil && sessionID != nil {
		return s.cartCache.UpdateGuestQuantity(ctx, *sessionID, itemID, quantity)
	}

	if userID != nil {
		item, err := s.cartRepo.GetItemByID(ctx, itemID)
		if err != nil {
			return ErrCartItemNotFound
		}

		if !s.isOwner(item, userID, nil) {
			return ErrUnauthorized
		}

		if quantity <= 0 {
			err = s.cartRepo.DeleteItem(ctx, itemID)
		} else {
			err = s.cartRepo.UpdateQuantity(ctx, itemID, quantity)
		}

		if err != nil {
			return err
		}

		_ = s.cartCache.InvalidateUserCart(ctx, *userID)
		return nil
	}

	return ErrUnauthorized
}

func (s *CartService) RemoveItem(ctx context.Context, userID *int, sessionID *string, itemID int) error {
	if userID == nil && sessionID != nil {
		return s.cartCache.RemoveGuestItem(ctx, *sessionID, itemID)
	}

	if userID != nil {
		item, err := s.cartRepo.GetItemByID(ctx, itemID)
		if err != nil {
			return ErrCartItemNotFound
		}

		if !s.isOwner(item, userID, nil) {
			return ErrUnauthorized
		}

		if err := s.cartRepo.DeleteItem(ctx, itemID); err != nil {
			return err
		}

		_ = s.cartCache.InvalidateUserCart(ctx, *userID)
		return nil
	}

	return ErrUnauthorized
}

func (s *CartService) ClearCart(ctx context.Context, userID *int, sessionID *string) error {
	if userID == nil && sessionID != nil {
		return s.cartCache.ClearGuestCart(ctx, *sessionID)
	}

	if userID != nil {
		if err := s.cartRepo.ClearByUserID(ctx, *userID); err != nil {
			return err
		}
		_ = s.cartCache.InvalidateUserCart(ctx, *userID)
		return nil
	}

	return nil
}

func (s *CartService) MergeGuestCart(ctx context.Context, sessionID string, userID int) error {
	guestItems, err := s.cartCache.GetAndClearGuestCart(ctx, sessionID)
	if err != nil {
		return err
	}

	if len(guestItems) == 0 {
		return nil
	}

	for _, guestItem := range guestItems {
		existingItem, err := s.cartRepo.FindItem(ctx, &userID, nil, guestItem.ProductID)
		if err != nil {
			return err
		}

		if existingItem != nil {
			err = s.cartRepo.UpdateQuantity(ctx, existingItem.ID, existingItem.Quantity+guestItem.Quantity)
		} else {
			_, err = s.cartRepo.AddItem(ctx, &userID, nil, guestItem.ProductID, guestItem.Quantity)
		}
		if err != nil {
			return err
		}
	}

	_ = s.cartCache.InvalidateUserCart(ctx, userID)
	return nil
}

func (s *CartService) isOwner(item *model.CartItem, userID *int, sessionID *string) bool {
	if userID != nil && item.UserID != nil && *item.UserID == *userID {
		return true
	}
	if sessionID != nil && item.SessionID != nil && *item.SessionID == *sessionID {
		return true
	}
	return false
}
