package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mpstrkv/spbtechrun/internal/cache"
	"github.com/mpstrkv/spbtechrun/internal/config"
	"github.com/mpstrkv/spbtechrun/internal/database"
	"github.com/mpstrkv/spbtechrun/internal/handler"
	"github.com/mpstrkv/spbtechrun/internal/repository"
	"github.com/mpstrkv/spbtechrun/internal/search"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	slog.SetDefault(log)

	cfg := config.MustLoad()
	log.Info("config loaded")

	db, err := database.NewPostgres(cfg.Postgres.DSN())
	if err != nil {
		log.Error("failed to connect to postgres", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer db.Close()

	if err := database.RunMigrations(db, "migrations"); err != nil {
		log.Error("failed to run migrations", slog.String("error", err.Error()))
		os.Exit(1)
	}

	redisClient, err := cache.NewClient(cfg.Redis.Addr())
	if err != nil {
		log.Error("failed to connect to redis", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer redisClient.Close()
	log.Info("redis connected", slog.String("addr", cfg.Redis.Addr()))

	categoryRepo := repository.NewCategoryRepository(db)
	outboxRepo := repository.NewOutboxRepository(db)
	productRepo := repository.NewProductRepository(db, outboxRepo)

	searchComponents := search.Setup(context.Background(), cfg.Elastic.URL, categoryRepo, outboxRepo, productRepo)
	var searchRepo *search.Repository
	if searchComponents != nil {
		searchRepo = searchComponents.Repository
	}

	gin.SetMode(gin.ReleaseMode)
	router := handler.NewRouter(handler.RouterDeps{
		DB:          db,
		JWTSecret:   cfg.JWT.Secret,
		RedisClient: redisClient,
		SearchRepo:  searchRepo,
		ProductRepo: productRepo,
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler: router,
	}

	done := make(chan struct{})

	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit

		log.Info("shutting down...")

		if searchComponents != nil {
			searchComponents.Stop()
			log.Info("search worker stopped")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Error("shutdown error", slog.String("error", err.Error()))
		}

		close(done)
	}()

	log.Info("server starting", slog.Int("port", cfg.HTTPPort))

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("server error", slog.String("error", err.Error()))
		os.Exit(1)
	}

	<-done
	log.Info("server stopped")
}
