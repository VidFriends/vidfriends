# VidFriends Android Architecture

## Overview

VidFriends Android is a 100% native Kotlin application following **Clean Architecture** with **MVVM** presentation pattern. The app is a short-form video sharing platform where users can send, receive, and watch videos from friends.

**Status:** Native Android — no KMP, no C++/NDK, no cross-platform frameworks (Flutter, React Native, Xamarin). Zero Java source files. Zero `.cpp`, `.c`, `.h` files.

---

## Module Structure

```
:app          → Application layer (DI, navigation, screens, local storage)
:common       → Domain layer (models, repository interfaces, pure Kotlin)
:network      → Data layer (API client, DTOs, auth/interceptors)
:ui           → Pure UI layer (theme, reusable components, navigation routes)
```

### `:app` — Application Module

**Plugins:** `android.application`, `kotlin.android`, `ksp`, `hilt`

Responsible for:
- Application entry point (`VidFriendsApplication`, `MainActivity`)
- Dependency injection wiring via Hilt modules
- Jetpack Navigation (Compose) — `VidFriendsNavHost`
- Screen-level Composables and their ViewModels
- Local persistence via Room (DAOs, entities, database)

Key source path: `app/src/main/java/com/vidfriends/android/`

| Layer | Package | Technology |
|---|---|---|
| Entry | `.di`, `.VidFriendsApplication.kt` | Hilt |
| UI | `.ui.feed`, `.ui.send` | Compose + ViewModel |
| Local | `.data.local` | Room (SQLite), DataStore |

### `:common` — Domain Module

**Plugins:** `android.library`, `kotlin.android`

Responsible for:
- Pure domain models (`Video`, `User`, `Comment`, `ApiResult`)
- Repository interfaces (contracts for data layer)
- Zero Android framework dependencies — only `kotlinx-coroutines-core`

Key source path: `common/src/main/java/com/vidfriends/android/domain/`

| Layer | Package | Contents |
|---|---|---|
| Models | `.domain.model` | `Video`, `User`, `Comment`, `AuthModels`, `ApiResult` |
| Contracts | `.domain.repository` | `FeedRepository`, `AuthRepository`, `VideoRepository`, `HistoryRepository` |

### `:network` — Data/Network Module

**Plugins:** `android.library`, `kotlin.android`, `ksp`, `hilt`

Responsible for:
- Retrofit API interface and interceptors
- Moshi DTOs and mappers (DTO → domain model)
- Token-based auth (auth/refresh interceptors)
- DataStore for user preferences

Key source path: `network/src/main/java/com/vidfriends/android/data/`

| Layer | Package | Technology |
|---|---|---|
| API | `.data.remote` | Retrofit + OkHttp + Moshi |
| DTOs | `.data.dto` | Moshi-annotated data classes |
| Auth | `.data.remote` | `AuthInterceptor`, `DynamicBaseUrlInterceptor` |
| Storage | `.data.preferences` | DataStore Preferences |
| DI | `.di` | Hilt module (Moshi) |

### `:ui` — Pure UI Module

**Plugins:** `android.library`, `kotlin.android`

Responsible for:
- Shared UI components (`ErrorView`, `LoadingIndicator`)
- Material 3 theme definition
- Navigation route constants

Key source path: `ui/src/main/java/com/vidfriends/android/ui/`

| Layer | Package | Contents |
|---|---|---|
| Theme | `.ui.theme` | `VidFriendsTheme` (Material 3) |
| Components | `.ui.components` | `ErrorView`, `LoadingIndicator` |
| Navigation | `.ui.navigation` | `NavRoutes` route constants |

---

## Architecture Layers

### Presentation (MVVM)

Screens follow the **MVVM** pattern with `StateFlow<UiState>`:

```
Composable (View) ──observes──> ViewModel (StateFlow<UiState>)
                                    │
                              repository (suspend fun / Flow)
                                    │
                              ApiResult<T> wrapper
```

Each screen has:
- A **UiState** data class (single source of truth)
- A **ViewModel** extending `androidx.lifecycle.ViewModel` with `@HiltViewModel`
- A **Composable** that collects state via `collectAsState()` and delegates user actions to ViewModel methods

Example: `FeedUiState` + `FeedViewModel` + `FeedScreen`

### Domain

Pure Kotlin module containing business logic contracts:
- **Models** — data classes representing business entities
- **Repository interfaces** — define data operations
- **ApiResult** — sealed class (`Success`, `Error`) wrapping all async data operations

### Data

Implemented in the `:network` and `:app` modules:
- **Remote** — Retrofit API calls → DTOs → domain models
- **Local** — Room DAOs + entities (for cache, offline support)
- **Auth** — `AuthInterceptor` injects JWT tokens; `DynamicBaseUrlInterceptor` handles staging/production URLs

### Dependency Injection

All DI is wired through **Hilt**:
- `@HiltAndroidApp` on `VidFriendsApplication`
- `@AndroidEntryPoint` on `MainActivity`
- `@HiltViewModel` on ViewModels
- `@Module @InstallIn(SingletonComponent::class)` for AppModule, NetworkModule, DatabaseModule, RepositoryModule

---

## API Contracts

**Base URL:** Configured via DataStore / `DynamicBaseUrlInterceptor`

| Method | Endpoint | Description |
|---|---|---|
| POST | `api/auth/register` | Register new user |
| POST | `api/auth/login` | Login user |
| POST | `api/auth/refresh` | Refresh JWT token |
| GET | `api/auth/me` | Get current user profile |
| GET | `api/feed` | Paginated feed of videos |
| GET | `api/videos/{id}` | Get single video detail |
| POST | `api/videos/send-link` | Send a video link to another user |
| POST | `api/videos/upload` | Upload a new video (multipart) |
| POST | `api/videos/{id}/like` | Like a video |
| DELETE | `api/videos/{id}/like` | Unlike a video |
| GET | `api/videos/{id}/comments` | Get video comments |
| POST | `api/videos/{id}/comments` | Add a comment |
| DELETE | `api/videos/{id}/comments/{commentId}` | Delete a comment |
| POST | `api/videos/{id}/watch` | Mark video as watched |
| DELETE | `api/videos/{id}` | Delete a video |
| GET | `api/videos/{id}/status` | Get video processing status |
| GET | `api/history` | Watch history (paginated) |
| GET | `api/health` | Health check |

**Auth:** Bearer JWT token in `Authorization` header via `AuthInterceptor`.

**Error handling:** All API calls return `Response<T>` (Retrofit) mapped to `ApiResult<T>` in repository implementations.

---

## Navigation

**Jetpack Navigation Compose** with `NavHost` defined in `VidFriendsNavHost`.

Routes (defined in `NavRoutes`):
| Route | Screen |
|---|---|
| `feed` | FeedScreen |
| `login` | (login/auth screen) |
| `register` | (registration screen) |
| `video/{videoId}` | VideoDetailScreen |
| `upload` | SendScreen |
| `profile` | ProfileScreen |

---

## Build Configuration

| Config | Value |
|---|---|
| **AGP** | 8.2.2 |
| **Kotlin** | 1.9.22 |
| **Compile SDK / Target** | 34 |
| **Min SDK** | 26 |
| **JVM Target** | 17 |
| **Compose BOM** | 2024.02.00 |
| **Compose Compiler** | 1.5.10 |

### Key Dependencies

| Category | Libraries |
|---|---|
| DI | Hilt 2.50 + KSP |
| UI | Jetpack Compose (Material 3, Navigation) |
| Network | Retrofit 2.9, OkHttp 4.12, Moshi 1.15 |
| Local | Room 2.6.1, DataStore 1.0.0 |
| Async | Kotlinx Coroutines 1.7.3 |
| Testing | JUnit 4.13.2, MockK 1.13.9 |

---

## CI Pipeline

**GitHub Actions** workflow (`.github/workflows/ci.yml`):

```yaml
Triggers: push to main/master, all pull requests
Jobs:
  - Setup: JDK 17 (Temurin)
  - Build: ./gradlew assembleDebug
  - Test:  ./gradlew test
  - Artifact: Upload debug APK (30-day retention)
```

---

## Build & Test Instructions

```bash
# Build debug APK
./gradlew assembleDebug

# Build release APK (minified)
./gradlew assembleRelease

# Run all unit tests
./gradlew test

# Run tests for a specific module
./gradlew :network:test
./gradlew :app:test

# Lint checks
./gradlew lint

# Clean build
./gradlew clean assembleDebug
```

### IDE Setup

- **Android Studio Hedgehog (2023.1.1)** or later recommended
- Open the `vidfriends-android` directory directly (not the parent `work/android/`)
- Sync Gradle before building
- Ensure JDK 17 is configured in Project Structure

### Environment Variables

Configure staging/production API base URL through DataStore preferences (no build config variants required).

---

## CI Pipeline Details

The CI pipeline runs on every push to `main`/`master` and every pull request:

1. **Checkout** source code
2. **Set up JDK 17** (Temurin distribution)
3. **Setup Gradle** with caching via `gradle/actions/setup-gradle@v4`
4. **Build debug APK** (`./gradlew assembleDebug`)
5. **Run unit tests** (`./gradlew test`)
6. **Upload debug APK** as a build artifact (GitHub Actions artifact, 30-day retention)

No emulator/instrumentation tests are run in CI currently. No SonarQube, lint baseline, or build scan integration configured yet — these are opportunities for improvement.
