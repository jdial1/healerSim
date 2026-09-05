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

// Release signing comes from environment variables in CI, or a gitignored
// keystore.properties for local release builds. See keystore.properties.example.
// No signing key is ever generated or committed here.
//
// A release build with no key configured is a hard failure, not a silent
// downgrade to unsigned: an unsigned AAB is rejected by Play, and finding that
// out from the Console rather than the build is a wasted round trip.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { stream -> load(stream) }
}

fun signingValue(env: String, prop: String): String? =
    System.getenv(env)?.takeIf { it.isNotBlank() } ?: keystoreProps.getProperty(prop)

// versionCode must be strictly monotonic and can never be reused — Play rejects
// a repeat upload outright, including a re-upload after a failed review. CI
// supplies it from the workflow run number, which increments on re-runs too.
// Local builds get 1: deliberately not uploadable, so nothing can bypass CI.
val versionCodeFromCi = System.getenv("AEGIS_VERSION_CODE")?.toIntOrNull()

// The one place the human-facing version is written. CI overrides it from the
// release tag (v1.0.0 -> 1.0.0); the splash screen renders it as-is.
val versionNameFromCi = System.getenv("AEGIS_VERSION_NAME")?.removePrefix("v")?.takeIf { it.isNotBlank() }

android {
    namespace = "com.jdial.aegis"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.jdial.aegis"
        minSdk = 26
        targetSdk = 37
        versionCode = versionCodeFromCi ?: 1
        versionName = versionNameFromCi ?: "1.0.0"
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
        // Always created, so the release build type can reference it with
        // getByName and has no null path to fall through.
        create("release") {
            signingValue("AEGIS_KEYSTORE_FILE", "storeFile")?.let { storeFile = rootProject.file(it) }
            storePassword = signingValue("AEGIS_KEYSTORE_PASSWORD", "storePassword")
            keyAlias = signingValue("AEGIS_KEY_ALIAS", "keyAlias")
            keyPassword = signingValue("AEGIS_KEY_PASSWORD", "keyPassword")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
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

// Tests need the synced content, and the parity goldens live outside the module.
tasks.withType<Test>().configureEach {
    dependsOn(syncGameData)
    systemProperty("aegis.parityDir", rootProject.file("../parity").absolutePath)
    systemProperty("aegis.assetsDir", generatedAssetsDir.absolutePath)
}

// --- release guards ---------------------------------------------------------
// Three things used to fail silently and only show up after upload, or on a
// player's phone. Each is now a build failure with a message that says what to do.

// 1. No keystore used to produce an *unsigned* release rather than an error.
val requireReleaseSigning = tasks.register("requireReleaseSigning") {
    val cfg = android.signingConfigs.getByName("release")
    val store = cfg.storeFile
    val pass = cfg.storePassword
    val alias = cfg.keyAlias
    doFirst {
        check(store?.exists() == true && !pass.isNullOrBlank() && !alias.isNullOrBlank()) {
            "Release signing is not configured, so this build would be unsigned and " +
                "rejected by Play. Set AEGIS_KEYSTORE_FILE / AEGIS_KEYSTORE_PASSWORD / " +
                "AEGIS_KEY_ALIAS / AEGIS_KEY_PASSWORD, or copy keystore.properties.example " +
                "to android/keystore.properties. See android/RELEASE.md."
        }
    }
}

// 2. syncGameData is a Sync task with no content assertion, so a truncated or
//    partially-synced checkout produces a release with no icons and exit 0 —
//    IconLoader falls back to a placeholder, so it runs, it just looks broken.
val verifyGameAssets = tasks.register("verifyGameAssets") {
    dependsOn(syncGameData)
    val dir = generatedAssetsDir
    doLast {
        val icons = File(dir, "icons").walkTopDown().count { it.isFile }
        val data = File(dir, "data").listFiles()?.count { it.extension == "json" } ?: 0
        check(icons >= 150 && data >= 5) {
            "Game assets are incomplete (icons=$icons, data=$data). " +
                "public/icons and src/data are tracked, so this usually means a partial " +
                "checkout. Restore them with `git checkout -- public/icons src/data`."
        }
    }
}

tasks.matching { it.name == "bundleRelease" || it.name == "assembleRelease" }.configureEach {
    dependsOn(requireReleaseSigning, verifyGameAssets)
}
// AGP's own validateSigningRelease also fails on a missing key, but says only
// "Keystore file not set". Run ahead of it so the actionable message is the one
// the developer sees.
tasks.matching { it.name == "validateSigningRelease" }.configureEach {
    dependsOn(requireReleaseSigning)
}

// 3. R8 renaming an enum constant silently wipes every player's save (see
//    proguard-rules.pro). Nothing in CI exercised the minified build, so the
//    first sign would have been a support ticket.
//
//    This reads R8's own mapping file and asserts every enum constant kept its
//    name. Enum classes are discovered from the sources, so a new enum is
//    covered without touching this task. Removing the keep rule fails it, so it
//    is a real regression test and not decoration.
//
//    ponytail: static check on the mapping, not a running app. It catches
//    renamed or dropped enums — the failure that costs player data — but not a
//    general crash under R8. Add an instrumented smoke test if that ever bites.
val verifyMinifiedSaveContract = tasks.register("verifyMinifiedSaveContract") {
    val srcDir = file("src/main/kotlin")
    val mappingFile = layout.buildDirectory.file("outputs/mapping/release/mapping.txt")
    doLast {
        val mapping = mappingFile.get().asFile
        check(mapping.isFile) { "No R8 mapping at $mapping — did minification run?" }

        // "package com.x" + "enum class Foo" -> com.x.Foo
        val enums = srcDir.walkTopDown().filter { it.extension == "kt" }.flatMap { f ->
            val text = f.readText()
            val pkg = Regex("^package (.+)$", RegexOption.MULTILINE).find(text)?.groupValues?.get(1)?.trim()
            Regex("^enum class ([A-Za-z0-9_]+)", RegexOption.MULTILINE).findAll(text)
                .map { m -> "$pkg.${m.groupValues[1]}" }
        }.toList()
        check(enums.isNotEmpty()) { "Found no enum classes under $srcDir — the scan is broken." }

        val lines = mapping.readLines()
        val broken = mutableListOf<String>()
        for (fqn in enums) {
            val start = lines.indexOfFirst { it.startsWith("$fqn -> ") }
            if (start < 0) {
                broken += "$fqn: absent from the mapping (removed or inlined by R8)"
                continue
            }
            // The class name may be renamed freely — it never reaches disk. Only
            // the constant names do, via kotlinx's by-name encoding and valueOf.
            // Constants are the fields whose declared type is the enum itself.
            for (i in start + 1 until lines.size) {
                val line = lines[i]
                // R8 interleaves metadata comments at column 0 inside a class
                // block, so they must be skipped, not treated as the end of it.
                if (line.startsWith("#")) continue
                if (!line.startsWith(" ") && !line.startsWith("\t")) break
                val parts = line.trim().split(" ")
                if (parts.size == 4 && parts[0] == fqn && parts[2] == "->" && parts[1] != parts[3]) {
                    broken += "$fqn.${parts[1]} was renamed to ${parts[3]}"
                }
            }
        }
        check(broken.isEmpty()) {
            "R8 renamed or dropped enum constants that are persisted by name. Every existing " +
                "save would decode to an empty roster on the next launch.\n  " +
                broken.joinToString("\n  ") +
                "\nCheck the -keepclassmembers enum rule in app/proguard-rules.pro."
        }
    }
}

tasks.matching { it.name == "minifyReleaseWithR8" }.configureEach {
    finalizedBy(verifyMinifiedSaveContract)
}
