pluginManagement { repositories { gradlePluginPortal(); mavenCentral() } }
rootProject.name = "bio-attestation"
val verifierSource = providers.gradleProperty("verifierSource").orElse("upstream").get()
includeBuild(verifierSource) {
    dependencySubstitution {
        substitute(module("com.android.keyattestation:keyattestation")).using(project(":"))
    }
}
