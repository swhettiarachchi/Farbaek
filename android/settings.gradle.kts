// Farbaek for Android (ADR 0099): a Trusted Web Activity that opens
// www.farbaek.com/app full screen in the phone's Chrome. Built on GitHub's
// Linux runner (.github/workflows/android.yml) with Gradle 9.8.1.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "farbaek-android"
include(":app")
// The Mesh protocol in plain Java (ADR 0193), tested on a computer and used by the app.
include(":mesh-core")
