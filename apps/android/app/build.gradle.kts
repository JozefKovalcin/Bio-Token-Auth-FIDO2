import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val serviceOrigin = providers.gradleProperty("bioServiceOrigin").orElse("https://auth.bio-token.test").get()
val serviceUri = URI(serviceOrigin)
require(
    serviceUri.scheme == "https" &&
        serviceUri.host != null &&
        serviceUri.userInfo == null &&
        serviceUri.rawQuery == null &&
        serviceUri.rawFragment == null &&
        serviceUri.path.isNullOrEmpty()
) {
    "bioServiceOrigin must be an HTTPS origin without credentials, path, query or fragment"
}

val lanResources = layout.buildDirectory.dir("generated/lanResources")
val generateLanNetworkSecurity by tasks.registering {
    inputs.property("serviceHost", serviceUri.host)
    outputs.dir(lanResources)
    doLast {
        val xml = lanResources.get().file("xml/network_security_config.xml").asFile
        xml.parentFile.mkdirs()
        xml.writeText(
            """
            <?xml version="1.0" encoding="utf-8"?>
            <network-security-config>
                <base-config cleartextTrafficPermitted="false">
                    <trust-anchors><certificates src="system" /></trust-anchors>
                </base-config>
                <domain-config cleartextTrafficPermitted="false">
                    <domain includeSubdomains="false">${serviceUri.host}</domain>
                    <trust-anchors><certificates src="system" /><certificates src="user" /></trust-anchors>
                </domain-config>
            </network-security-config>
            """.trimIndent()
        )
    }
}

android {
    namespace = "sk.biotoken.android"
    compileSdk = 35
    defaultConfig {
        applicationId = "sk.biotoken.android"
        minSdk = 30
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "SERVICE_ORIGIN", "\"$serviceOrigin\"")
        manifestPlaceholders["serviceHost"] = serviceUri.host
        resValue("string", "service_host", serviceUri.host)
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        debug { applicationIdSuffix = ".debug" }
        release { isMinifyEnabled = false }
    }
    sourceSets["debug"].res.srcDir(lanResources)
    testOptions { unitTests.isReturnDefaultValues = true }
}

tasks.matching { it.name == "preDebugBuild" }.configureEach {
    dependsOn(generateLanNetworkSecurity)
}

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.preview)
    implementation(libs.activity.compose)
    implementation(libs.fragment)
    implementation(libs.lifecycle.compose)
    implementation(libs.lifecycle.viewmodel)
    implementation(libs.biometric)
    implementation(libs.coroutines.android)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.zxing)
    debugImplementation(libs.compose.tooling)
    debugImplementation(libs.compose.test.manifest)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext)
    androidTestImplementation(libs.compose.test)
}
