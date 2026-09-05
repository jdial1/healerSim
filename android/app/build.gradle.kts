import java.util.Properties

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

// Release signing is opt-in: drop a keystore.properties next to this file with
// storeFile / storePassword / keyAlias / keyPassword and the release build picks
// it up. Without it, release still assembles (unsigned) so CI never needs secrets.
// The file is gitignored — no signing key is ever generated or committed here.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { stream -> load(stream) }
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

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
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

// AGP 9 rejects task providers as source dirs, so the asset directory is static
// and every task that reads it declares the dependency explicitly. Asset merging
// is the obvious consumer; lint also scans the source sets, and without this it
// fails validation with an implicit-dependency error.
tasks.withType<com.android.build.gradle.tasks.MergeSourceSetFolders>().configureEach {
    dependsOn(syncGameData)
}
tasks.matching { it.name.contains("lint", ignoreCase = true) }.configureEach {
    dependsOn(syncGameData)
}

tasks.withType<Test>().configureEach {
    dependsOn(syncGameData)
}

// The parity golden file lives outside the module; expose its path to tests.
tasks.withType<Test>().configureEach {
    systemProperty("aegis.parityDir", rootProject.file("../parity").absolutePath)
    systemProperty("aegis.assetsDir", generatedAssetsDir.absolutePath)
}
