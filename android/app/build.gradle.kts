plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// The web app under ../../ is the single source of truth for all game content.
// Rather than duplicating 3,252 lines of JSON, sync it into assets at build time.
val webRoot = rootProject.layout.projectDirectory.dir("..")

val generatedAssetsDir = layout.buildDirectory.dir("generated/gameAssets").get().asFile

val syncGameData = tasks.register<Sync>("syncGameData") {
    description = "Copies game content JSON and icons from the web app into Android assets."
    into(generatedAssetsDir)

    from(webRoot.dir("src/data")) {
        include("*.json")
        into("data")
    }
    from(webRoot.dir("src/classes")) {
        include("*/class.json", "*/spells.json", "*/talents.json")
        into("classes")
    }
    from(webRoot.dir("public/icons")) {
        into("icons")
    }
}

android {
    namespace = "com.jdial.aegis"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.jdial.aegis"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    sourceSets {
        getByName("main") {
            kotlin.directories.add("src/main/kotlin")
            assets.directories.add(generatedAssetsDir.path)
        }
        getByName("test") {
            kotlin.directories.add("src/test/kotlin")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}


dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.core.splashscreen)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
}

// AGP 9 rejects task providers as source dirs, so the directory is static and the
// dependency is declared explicitly against the tasks that consume assets.
tasks.withType<com.android.build.gradle.tasks.MergeSourceSetFolders>().configureEach {
    dependsOn(syncGameData)
}
