FROM golang:1.26-alpine AS build

RUN apk add --no-cache gcc musl-dev

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /vidfriends-server ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates curl ffmpeg yt-dlp python3
RUN adduser -D -h /app vidfriends
WORKDIR /app

COPY --from=build /vidfriends-server .

USER vidfriends
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["sh", "-c", "wget -qO- http://localhost:8080/api/health || exit 1"]

ENTRYPOINT ["./vidfriends-server"]
