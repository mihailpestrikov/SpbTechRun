package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/elastic/go-elasticsearch/v8/esapi"
)

type Repository struct {
	client       *Client
	categoryPath *CategoryPathResolver
}

func NewRepository(client *Client, categoryPath *CategoryPathResolver) *Repository {
	return &Repository{client: client, categoryPath: categoryPath}
}

func (r *Repository) EnsureIndex(ctx context.Context) error {
	res, err := r.client.es.Indices.Exists([]string{IndexName})
	if err != nil {
		return fmt.Errorf("check index exists: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode == 200 {
		r.updateIndexSettings(ctx)
		return nil
	}

	res, err = r.client.es.Indices.Create(
		IndexName,
		r.client.es.Indices.Create.WithBody(strings.NewReader(IndexMapping)),
		r.client.es.Indices.Create.WithContext(ctx),
	)
	if err != nil {
		return fmt.Errorf("create index: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("create index error: %s", res.String())
	}

	return nil
}

func (r *Repository) updateIndexSettings(ctx context.Context) {
	settings := strings.NewReader(`{"index": {"max_result_window": 100000}}`)
	r.client.es.Indices.PutSettings(
		settings,
		r.client.es.Indices.PutSettings.WithIndex(IndexName),
		r.client.es.Indices.PutSettings.WithContext(ctx),
	)
}

func (r *Repository) IndexProduct(ctx context.Context, doc *ProductDocument) error {
	data, err := json.Marshal(doc)
	if err != nil {
		return err
	}

	res, err := r.client.es.Index(
		IndexName,
		bytes.NewReader(data),
		r.client.es.Index.WithDocumentID(fmt.Sprintf("%d", doc.ID)),
		r.client.es.Index.WithContext(ctx),
		r.client.es.Index.WithRefresh("false"),
	)
	if err != nil {
		return fmt.Errorf("index product: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("index product error: %s", res.String())
	}

	return nil
}

func (r *Repository) DeleteProduct(ctx context.Context, id int) error {
	res, err := r.client.es.Delete(
		IndexName,
		fmt.Sprintf("%d", id),
		r.client.es.Delete.WithContext(ctx),
	)
	if err != nil {
		return fmt.Errorf("delete product: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() && res.StatusCode != 404 {
		return fmt.Errorf("delete product error: %s", res.String())
	}

	return nil
}

func (r *Repository) BulkIndex(ctx context.Context, docs []ProductDocument) error {
	if len(docs) == 0 {
		return nil
	}

	var buf bytes.Buffer
	for _, doc := range docs {
		meta := fmt.Sprintf(`{"index":{"_index":"%s","_id":"%d"}}`, IndexName, doc.ID)
		buf.WriteString(meta)
		buf.WriteString("\n")

		data, err := json.Marshal(doc)
		if err != nil {
			return err
		}
		buf.Write(data)
		buf.WriteString("\n")
	}

	res, err := r.client.es.Bulk(
		bytes.NewReader(buf.Bytes()),
		r.client.es.Bulk.WithContext(ctx),
		r.client.es.Bulk.WithRefresh("false"),
	)
	if err != nil {
		return fmt.Errorf("bulk index: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("bulk index error: %s", res.String())
	}

	return nil
}

type SearchQuery struct {
	Text        string
	CategoryIDs []int
	MinPrice    *float64
	MaxPrice    *float64
	Vendors     []string
	Available   *bool
	Limit       int
	Offset      int
}

type Aggregations struct {
	Categories []CategoryAgg `json:"categories"`
	Vendors    []VendorAgg   `json:"vendors"`
	PriceRange *PriceRange   `json:"price_range,omitempty"`
}

type CategoryAgg struct {
	ID       int    `json:"id"`
	ParentID *int   `json:"parent_id"`
	Name     string `json:"name"`
	Count    int64  `json:"count"`
}

type VendorAgg struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

type PriceRange struct {
	Min float64 `json:"min"`
	Max float64 `json:"max"`
}

type SearchResult struct {
	Products     []ProductDocument
	Total        int64
	Aggregations *Aggregations
}

func (r *Repository) Search(ctx context.Context, q SearchQuery) (*SearchResult, error) {
	query := r.buildQuery(q)

	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(query); err != nil {
		return nil, err
	}

	res, err := r.client.es.Search(
		r.client.es.Search.WithContext(ctx),
		r.client.es.Search.WithIndex(IndexName),
		r.client.es.Search.WithBody(&buf),
	)
	if err != nil {
		return nil, fmt.Errorf("search: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return nil, fmt.Errorf("search error: %s", res.String())
	}

	var response searchResponse
	if err := json.NewDecoder(res.Body).Decode(&response); err != nil {
		return nil, err
	}

	return r.parseSearchResponse(&response), nil
}

func (r *Repository) parseSearchResponse(response *searchResponse) *SearchResult {
	result := &SearchResult{
		Total:    response.Hits.Total.Value,
		Products: make([]ProductDocument, 0, len(response.Hits.Hits)),
	}
	for _, hit := range response.Hits.Hits {
		result.Products = append(result.Products, hit.Source)
	}

	aggs := &Aggregations{
		Categories: make([]CategoryAgg, 0, len(response.Aggregations.Categories.Buckets)),
		Vendors:    make([]VendorAgg, 0, len(response.Aggregations.Vendors.Buckets)),
	}

	for _, bucket := range response.Aggregations.Categories.Buckets {
		catID := bucket.KeyInt()
		parentID := r.categoryPath.GetParentID(catID)
		var parentIDValue *int
		if parentID != nil {
			parentIDValue = parentID
		}
		aggs.Categories = append(aggs.Categories, CategoryAgg{
			ID:       catID,
			ParentID: parentIDValue,
			Name:     r.categoryPath.GetName(catID),
			Count:    bucket.DocCount,
		})
	}

	for _, bucket := range response.Aggregations.Vendors.Buckets {
		aggs.Vendors = append(aggs.Vendors, VendorAgg{
			Name:  bucket.KeyString(),
			Count: bucket.DocCount,
		})
	}

	if response.Aggregations.PriceStats.Min > 0 || response.Aggregations.PriceStats.Max > 0 {
		aggs.PriceRange = &PriceRange{
			Min: response.Aggregations.PriceStats.Min,
			Max: response.Aggregations.PriceStats.Max,
		}
	}

	result.Aggregations = aggs

	return result
}

func (r *Repository) buildQuery(q SearchQuery) map[string]interface{} {
	must := []map[string]interface{}{}
	filter := []map[string]interface{}{}
	postFilter := []map[string]interface{}{}

	if q.Text != "" {
		must = append(must, map[string]interface{}{
			"multi_match": map[string]interface{}{
				"query":    q.Text,
				"fields":   []string{"name^3", "name.keyword^4", "description", "vendor^2"},
				"type":     "best_fields",
				"operator": "and",
			},
		})
	}

	if len(q.CategoryIDs) > 0 {
		terms := make([]interface{}, len(q.CategoryIDs))
		for i, id := range q.CategoryIDs {
			terms[i] = id
		}
		postFilter = append(postFilter, map[string]interface{}{
			"terms": map[string]interface{}{
				"category_path": terms,
			},
		})
	}

	if q.MinPrice != nil || q.MaxPrice != nil {
		priceRange := map[string]interface{}{}
		if q.MinPrice != nil {
			priceRange["gte"] = *q.MinPrice
		}
		if q.MaxPrice != nil {
			priceRange["lte"] = *q.MaxPrice
		}
		filter = append(filter, map[string]interface{}{
			"range": map[string]interface{}{
				"price": priceRange,
			},
		})
	}

	if len(q.Vendors) > 0 {
		terms := make([]interface{}, len(q.Vendors))
		for i, v := range q.Vendors {
			terms[i] = v
		}
		filter = append(filter, map[string]interface{}{
			"terms": map[string]interface{}{
				"vendor.keyword": terms,
			},
		})
	}

	if q.Available != nil {
		filter = append(filter, map[string]interface{}{
			"term": map[string]interface{}{
				"available": *q.Available,
			},
		})
	}

	boolQuery := map[string]interface{}{}
	if len(must) > 0 {
		boolQuery["must"] = must
	}
	if len(filter) > 0 {
		boolQuery["filter"] = filter
	}

	if len(boolQuery) == 0 {
		boolQuery["must"] = []map[string]interface{}{
			{"match_all": map[string]interface{}{}},
		}
	}

	limit := q.Limit
	if limit <= 0 {
		limit = 20
	}

	result := map[string]interface{}{
		"query": map[string]interface{}{
			"bool": boolQuery,
		},
		"track_total_hits": true,
		"from":             q.Offset,
		"size":             limit,
		"sort": []map[string]interface{}{
			{"_score": map[string]interface{}{"order": "desc"}},
			{"id": map[string]interface{}{"order": "asc"}},
		},
		"aggs": map[string]interface{}{
			"categories": map[string]interface{}{
				"terms": map[string]interface{}{
					"field": "category_path",
					"size":  5000,
				},
			},
			"vendors": map[string]interface{}{
				"terms": map[string]interface{}{
					"field": "vendor.keyword",
					"size":  500,
				},
			},
			"price_stats": map[string]interface{}{
				"stats": map[string]interface{}{
					"field": "price",
				},
			},
		},
	}

	if len(postFilter) > 0 {
		result["post_filter"] = map[string]interface{}{
			"bool": map[string]interface{}{
				"filter": postFilter,
			},
		}
	}

	return result
}

func (r *Repository) Refresh(ctx context.Context) error {
	res, err := r.client.es.Indices.Refresh(
		r.client.es.Indices.Refresh.WithIndex(IndexName),
		r.client.es.Indices.Refresh.WithContext(ctx),
	)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return nil
}

func (r *Repository) DeleteIndex(ctx context.Context) error {
	req := esapi.IndicesDeleteRequest{
		Index: []string{IndexName},
	}
	res, err := req.Do(ctx, r.client.es)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return nil
}

func (r *Repository) GetDocumentCount(ctx context.Context) (int64, error) {
	res, err := r.client.es.Count(
		r.client.es.Count.WithContext(ctx),
		r.client.es.Count.WithIndex(IndexName),
	)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()

	if res.IsError() {
		if res.StatusCode == 404 {
			return 0, nil
		}
		return 0, fmt.Errorf("count error: %s", res.String())
	}

	var result struct {
		Count int64 `json:"count"`
	}
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		return 0, err
	}

	return result.Count, nil
}
