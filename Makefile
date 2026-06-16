.PHONY: build test lint run clean docker-build dev \
        build-prod deploy deploy-down logs prod-logs \
        test-integration test-integration-ci

GO ?= go
APP_NAME ?= vidfriends-server
IMAGE_TAG ?= $(APP_NAME):latest

build:
	$(GO) build -ldflags="-s -w" -o $(APP_NAME) ./cmd/server

build-prod:
	CGO_ENABLED=0 $(GO) build -ldflags="-s -w -extldflags=-static" -o $(APP_NAME) ./cmd/server
	@echo "Static binary built: $(APP_NAME)"

test:
	$(GO) test -race -count=1 -timeout 60s ./...

test-integration:
	docker compose up --build --wait && \
	$(GO) test -count=1 -tags=integration -timeout 120s ./test/integration/ && \
	docker compose down

test-integration-ci:
	$(GO) test -count=1 -tags=integration -timeout 120s ./test/integration/

lint:
	golangci-lint run --timeout 120s ./...

run: build
	./vidfriends-server

clean:
	rm -f $(APP_NAME)

docker-build:
	docker build -t $(IMAGE_TAG) .

dev:
	docker compose up --build --wait

deploy:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d --wait

deploy-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

logs:
	docker compose logs -f api

prod-logs:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
