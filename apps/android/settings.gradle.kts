pluginManagement {
    repositories {
        // dl.google.com (google()) is unreachable on this network — route through the Aliyun
        // mirror instead. Swap back to google() first if this project ever builds somewhere
        // without that restriction.
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        mavenCentral()
    }
}

rootProject.name = "learnbox-android"
include(":app")
