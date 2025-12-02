package search

type searchResponse struct {
	Hits         hitsResponse         `json:"hits"`
	Aggregations aggregationsResponse `json:"aggregations"`
}

type hitsResponse struct {
	Total totalResponse `json:"total"`
	Hits  []hitResponse `json:"hits"`
}

type totalResponse struct {
	Value int64 `json:"value"`
}

type hitResponse struct {
	Source ProductDocument `json:"_source"`
}

type aggregationsResponse struct {
	Categories termsBuckets     `json:"categories"`
	Vendors    termsBuckets     `json:"vendors"`
	PriceStats priceStatsResult `json:"price_stats"`
}

type termsBuckets struct {
	Buckets []bucketResponse `json:"buckets"`
}

type bucketResponse struct {
	Key      interface{} `json:"key"`
	DocCount int64       `json:"doc_count"`
}

type priceStatsResult struct {
	Min float64 `json:"min"`
	Max float64 `json:"max"`
}

func (b *bucketResponse) KeyInt() int {
	if v, ok := b.Key.(float64); ok {
		return int(v)
	}
	return 0
}

func (b *bucketResponse) KeyString() string {
	if v, ok := b.Key.(string); ok {
		return v
	}
	return ""
}
