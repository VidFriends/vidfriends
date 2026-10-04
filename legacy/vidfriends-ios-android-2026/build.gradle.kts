plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.hilt.android) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.detekt)
}

dependencies {
    detekt(libs.detekt)
    detekt(libs.detekt.formatting)
}

detekt {
    config.setFrom(file("detekt.yml"))
    buildUponDefaultConfig = true
    parallel = true
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}
