package service

import (
	"context"
	"errors"

	"github.com/mpstrkv/spbtechrun/internal/cache"
	"github.com/mpstrkv/spbtechrun/internal/model"
	"github.com/mpstrkv/spbtechrun/internal/repository"
)

var (
	ErrEmptyCart     = errors.New("cart is empty")
	ErrOrderNotFound = errors.New("order not found")
	ErrNotOrderOwner = errors.New("not order owner")
)

type OrderService struct {
	orderRepo   *repository.OrderRepository
	cartRepo    *repository.CartRepository
	productRepo *repository.ProductRepository
	cartCache   *cache.CartCache
}

func NewOrderService(
	orderRepo *repository.OrderRepository,
	cartRepo *repository.CartRepository,
	productRepo *repository.ProductRepository,
	cartCache *cache.CartCache,
) *OrderService {
	return &OrderService{
		orderRepo:   orderRepo,
		cartRepo:    cartRepo,
		productRepo: productRepo,
		cartCache:   cartCache,
	}
}

type OrderWithItems struct {
	Order    model.Order
	Items    []model.OrderItem
	Products map[int]*model.Product
}

func (s *OrderService) CreateOrder(ctx context.Context, userID int) (*OrderWithItems, error) {
	cartItems, err := s.cartRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if len(cartItems) == 0 {
		return nil, ErrEmptyCart
	}

	productIDs := make([]int, 0, len(cartItems))
	for _, item := range cartItems {
		productIDs = append(productIDs, item.ProductID)
	}

	products, err := s.productRepo.GetByIDs(ctx, productIDs)
	if err != nil {
		return nil, err
	}

	var total float64
	orderItems := make([]model.OrderItem, 0, len(cartItems))
	for _, cartItem := range cartItems {
		product, ok := products[cartItem.ProductID]
		if !ok {
			continue
		}

		price := product.Price
		itemTotal := price * float64(cartItem.Quantity)
		total += itemTotal

		orderItems = append(orderItems, model.OrderItem{
			ProductID: cartItem.ProductID,
			Quantity:  cartItem.Quantity,
			Price:     price,
		})
	}

	order := &model.Order{
		UserID: userID,
		Status: "pending",
		Total:  total,
	}

	if err := s.orderRepo.Create(ctx, order); err != nil {
		return nil, err
	}

	for i := range orderItems {
		orderItems[i].OrderID = order.ID
	}

	if err := s.orderRepo.CreateItems(ctx, orderItems); err != nil {
		return nil, err
	}

	if err := s.cartRepo.ClearByUserID(ctx, userID); err != nil {
		return nil, err
	}

	_ = s.cartCache.InvalidateUserCart(ctx, userID)

	go s.productRepo.IncrementOrderCount(ctx, productIDs)

	productPtrs := make(map[int]*model.Product)
	for id, p := range products {
		p := p
		productPtrs[id] = &p
	}

	return &OrderWithItems{
		Order:    *order,
		Items:    orderItems,
		Products: productPtrs,
	}, nil
}

func (s *OrderService) GetUserOrders(ctx context.Context, userID int) ([]OrderWithItems, error) {
	orders, err := s.orderRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if len(orders) == 0 {
		return []OrderWithItems{}, nil
	}

	orderIDs := make([]int, len(orders))
	for i, o := range orders {
		orderIDs[i] = o.ID
	}

	itemsByOrder, err := s.orderRepo.GetItemsByOrderIDs(ctx, orderIDs)
	if err != nil {
		return nil, err
	}

	productIDSet := make(map[int]struct{})
	for _, items := range itemsByOrder {
		for _, item := range items {
			productIDSet[item.ProductID] = struct{}{}
		}
	}
	productIDs := make([]int, 0, len(productIDSet))
	for id := range productIDSet {
		productIDs = append(productIDs, id)
	}

	products, err := s.productRepo.GetByIDs(ctx, productIDs)
	if err != nil {
		return nil, err
	}

	productPtrs := make(map[int]*model.Product)
	for id, p := range products {
		p := p
		productPtrs[id] = &p
	}

	result := make([]OrderWithItems, len(orders))
	for i, order := range orders {
		result[i] = OrderWithItems{
			Order:    order,
			Items:    itemsByOrder[order.ID],
			Products: productPtrs,
		}
	}

	return result, nil
}

func (s *OrderService) GetOrderByID(ctx context.Context, userID, orderID int) (*OrderWithItems, error) {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if order.UserID != userID {
		return nil, ErrNotOrderOwner
	}

	items, err := s.orderRepo.GetItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	productIDs := make([]int, len(items))
	for i, item := range items {
		productIDs[i] = item.ProductID
	}

	products, err := s.productRepo.GetByIDs(ctx, productIDs)
	if err != nil {
		return nil, err
	}

	productPtrs := make(map[int]*model.Product)
	for id, p := range products {
		p := p
		productPtrs[id] = &p
	}

	return &OrderWithItems{
		Order:    *order,
		Items:    items,
		Products: productPtrs,
	}, nil
}
