FROM golang:1.22 as builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tzdata && rm -rf /var/lib/apt/lists/*
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp
COPY --from=builder /app/server /usr/local/bin/server
COPY migrations /app/migrations
WORKDIR /app
ENV LISTEN_ADDRESS=:8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/server"]
