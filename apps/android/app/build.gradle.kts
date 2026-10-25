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
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = false
        }
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
