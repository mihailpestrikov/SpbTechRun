package config

import (
	"fmt"

	"github.com/ilyakaznacheev/cleanenv"
)

type Config struct {
	HTTPPort           int    `env:"HTTP_PORT" env-default:"8080"`
	RecommendationsURL string `env:"RECOMMENDATIONS_URL" env-default:"http://localhost:8000"`
	Postgres           Postgres
	Redis              Redis
	Elastic            Elastic
	JWT                JWT
}

type Postgres struct {
	Host     string `env:"POSTGRES_HOST" env-default:"localhost"`
	Port     int    `env:"POSTGRES_PORT" env-default:"5432"`
	User     string `env:"POSTGRES_USER" env-default:"postgres"`
	Password string `env:"POSTGRES_PASSWORD" env-default:"postgres"`
	Database string `env:"POSTGRES_DB" env-default:"spbtechrun"`
}

func (p Postgres) DSN() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=disable",
		p.User, p.Password, p.Host, p.Port, p.Database,
	)
}

type Redis struct {
	Host string `env:"REDIS_HOST" env-default:"localhost"`
	Port int    `env:"REDIS_PORT" env-default:"6379"`
}

func (r Redis) Addr() string {
	return fmt.Sprintf("%s:%d", r.Host, r.Port)
}

type Elastic struct {
	URL string `env:"ELASTIC_URL" env-default:"http://localhost:9200"`
}

type JWT struct {
	Secret string `env:"JWT_SECRET" env-default:"dev-secret-key"`
}

func MustLoad() *Config {
	var cfg Config

	if err := cleanenv.ReadEnv(&cfg); err != nil {
		panic(fmt.Sprintf("failed to read config: %v", err))
	}

	return &cfg
}
