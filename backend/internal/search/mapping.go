package search

const IndexName = "products"

const IndexMapping = `{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "max_result_window": 100000,
    "analysis": {
      "filter": {
        "russian_stop": {
          "type": "stop",
          "stopwords": "_russian_"
        },
        "russian_stemmer": {
          "type": "stemmer",
          "language": "russian"
        },
        "edge_ngram_filter": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 15
        }
      },
      "analyzer": {
        "russian_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "russian_stop", "russian_stemmer"]
        },
        "autocomplete_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "edge_ngram_filter"]
        },
        "autocomplete_search": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "id": { "type": "integer" },
      "name": {
        "type": "text",
        "analyzer": "russian_analyzer",
        "fields": {
          "autocomplete": {
            "type": "text",
            "analyzer": "autocomplete_analyzer",
            "search_analyzer": "autocomplete_search"
          },
          "keyword": {
            "type": "keyword"
          }
        }
      },
      "description": {
        "type": "text",
        "analyzer": "russian_analyzer"
      },
      "vendor": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "category_id": { "type": "integer" },
      "category_path": { "type": "integer" },
      "category_name": {
        "type": "text",
        "analyzer": "russian_analyzer"
      },
      "price": { "type": "float" },
      "available": { "type": "boolean" },
      "picture": { "type": "keyword", "index": false },
      "country": { "type": "keyword" },
      "created_at": { "type": "date" },
      "updated_at": { "type": "date" }
    }
  }
}`
