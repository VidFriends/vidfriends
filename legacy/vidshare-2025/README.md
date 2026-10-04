# VidShare

VidShare is a containerised full-stack application for sharing short-form videos with friends. The backend is written in Go, powered by PostgreSQL and `yt-dlp` for pulling video metadata. A React + TypeScript frontend delivers a responsive experience for managing friends and sharing links.

## Features

- User registration and session-based authentication
- Friend management with mutual relationships
- Share videos with notes and receive a personalised feed
- Automatic metadata lookups via `yt-dlp`
- Docker Compose stack with PostgreSQL, Go API and static frontend

## Getting started

### Prerequisites

- Docker and Docker Compose

### Environment variables

The backend requires the following environment variables:

- `DATABASE_URL` – PostgreSQL connection string (e.g. `postgres://user:pass@db:5432/vidshare?sslmode=disable`)
- `SESSION_SECRET` – random string used to sign cookies
- `ALLOW_ORIGINS` – optional comma-separated list of origins allowed for CORS (defaults to `*`)
- `YT_EXECUTABLE` – path to the `yt-dlp` binary inside the container (defaults to `yt-dlp`)

These are wired up automatically in the provided `docker-compose.yml`, but you can override them with your own values.

### Running with Docker Compose

```bash
cp .env.example .env # optional if you want to override defaults
docker compose up --build
```

The services exposed by default are:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8080
- PostgreSQL: localhost:5432 (user/password/db: `vidshare`)

The Go service applies SQL migrations on startup from `backend/migrations`.

### Local development

You can run the backend and frontend separately without containers.

**Backend**

```bash
cd backend
export DATABASE_URL=postgres://vidshare:vidshare@localhost:5432/vidshare?sslmode=disable
export SESSION_SECRET=dev-secret
go run ./cmd/server
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8080` by default. Adjust `VITE_API_BASE` if your API runs elsewhere.

## Testing

- Go unit tests: `cd backend && go test ./...`
- Frontend build: `cd frontend && npm run build`

## Project structure

```
backend/    Go API server, migrations and Dockerfile
frontend/   React + Vite frontend and Dockerfile
docker-compose.yml  Multi-service orchestration
```

## License

MIT
