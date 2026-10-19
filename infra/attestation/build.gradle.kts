plugins {
    kotlin("jvm") version "2.2.0"
    application
}
repositories { mavenCentral(); google() }
dependencies {
    implementation("com.android.keyattestation:keyattestation:0.4")
    implementation("com.google.code.gson:gson:2.11.0")
    testImplementation(kotlin("test"))
}
kotlin { jvmToolchain(21) }
application { mainClass.set("bio.attestation.ServerKt") }
tasks.test { useJUnitPlatform() }
