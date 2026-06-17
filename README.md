# VidFriends Web

React + TypeScript + Vite frontend for VidFriends, a shortform video sharing platform.

Built with React 19, TypeScript 6, Vite 8, Tailwind CSS 4, and React Router 7.

## Quick start

```bash
npm install
npm run dev      # dev server at http://localhost:5173
```

## Scripts

| Command              | Description                        |
|----------------------|------------------------------------|
| `npm run dev`        | Start Vite dev server              |
| `npm run build`      | Typecheck + production build       |
| `npm run lint`       | Run ESLint                         |
| `npm run typecheck`  | Run TypeScript compiler check      |
| `npm run test`       | Run Vitest test suite              |
| `npm run test:watch` | Run tests in watch mode            |
| `npm run preview`    | Preview production build locally   |

## Docker

```bash
docker build -t vidfriends-web .
docker run -p 8080:80 vidfriends-web
```

The container serves the built app via nginx and proxies `/api/*` requests to a backend at `http://backend:8080`.

## CI

Every push and pull request to `master` runs lint, typecheck, tests, and a production build via GitHub Actions.

## Project structure

```
src/
  components/   Reusable UI components
  context/      React context providers
  lib/          API client and type definitions
  pages/        Route-level page components
  test/         Test setup and test files
```
