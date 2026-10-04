pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "VidFriends"
include(":app")
include(":core:common")
include(":core:network")
include(":core:ui")
include(":feature:auth")
include(":feature:feed")
include(":feature:player")
include(":feature:share")
include(":feature:notifications")
