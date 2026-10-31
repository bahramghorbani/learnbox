plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ir.learnbox.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "ir.learnbox.app"
        minSdk = 24
        targetSdk = 34
        // M0: starting point only. See docs/release/VERSIONING.md "Android releases" for the
        // real source of truth once this leaves the prototype stage.
        versionCode = 2
        versionName = "0.1.1"
    }

    // M2: release signing reads from env vars, never committed. The keystore itself lives
    // outside the repo (/Volumes/LearnBox-Dev/secrets/learnbox-android-release/) — this file is
    // permanent app identity for whichever store it's uploaded to, so it's generated once and
    // backed up, not regenerated per build. A dev without the env vars simply can't build
    // release — same pattern as every other secret in this project.
    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("LEARNBOX_RELEASE_KEYSTORE")
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("LEARNBOX_RELEASE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("LEARNBOX_RELEASE_KEY_ALIAS")
                keyPassword = System.getenv("LEARNBOX_RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    // M2: one flavor per app-store distribution, each wiring its own in-app billing
    // (see NativeBridge.kt). "generic" is the current/default build (no store IAB yet,
    // keeps M1's honest "unavailable" stub); myket and bazaar share one AIDL client
    // (billing/AidlBillingBridge.kt) and differ only in their src/<flavor> manifest + factory.
    flavorDimensions += "store"
    productFlavors {
        create("generic") {
            dimension = "store"
            buildConfigField("String", "STORE_CHANNEL", "\"none\"")
        }
        create("myket") {
            dimension = "store"
            buildConfigField("String", "STORE_CHANNEL", "\"android_myket\"")
        }
        create("bazaar") {
            dimension = "store"
            buildConfigField("String", "STORE_CHANNEL", "\"android_bazaar\"")
        }
    }

    buildFeatures {
        buildConfig = true
        aidl = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// M0 deliberately has zero AndroidX/Material dependencies: the whole screen is one
// android.webkit.WebView on the plain framework theme. This keeps the build reachable without
// Google's Maven (blocked on this network) and avoids a dependency we don't need yet.
// ponytail: add androidx.core/appcompat only when a real native screen (e.g. the IAB purchase
// bridge UI) needs it.
dependencies {
    testImplementation("junit:junit:4.13.2")
}
