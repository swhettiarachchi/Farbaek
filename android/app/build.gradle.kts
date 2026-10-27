import java.util.Properties

plugins {
    id("com.android.application")
}

val versions = Properties().apply { rootProject.file("version.properties").inputStream().use { load(it) } }

// The upload key, only on the build machine: CI decodes it from the repository's secrets
// (docs/mobile/android.md). Without it the bundle is built unsigned.
val keystore: String? = System.getenv("FARBAEK_ANDROID_KEYSTORE")

android {
    namespace = "com.farbaek.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.farbaek.app"
        minSdk = 24
        targetSdk = 36
        versionCode = versions.getProperty("versionCode").toInt()
        versionName = versions.getProperty("versionName")
    }

    signingConfigs {
        if (keystore != null) {
            create("upload") {
                storeFile = file(keystore)
                storeType = "pkcs12"
                storePassword = System.getenv("FARBAEK_ANDROID_KEYSTORE_PASSWORD")
                keyAlias = "farbaek-upload"
                keyPassword = System.getenv("FARBAEK_ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // There is no app code of our own to shrink: the app is androidbrowserhelper's launcher.
            isMinifyEnabled = false
            if (keystore != null) signingConfig = signingConfigs.getByName("upload")
        }
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
