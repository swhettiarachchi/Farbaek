// Farbaek Mesh on Android (ADR 0193): the farbaek-mesh/1 protocol in plain Java,
// with no Android classes, so it's tested on this computer against the desktop
// agent's own Node implementation, and the app wraps it.
plugins {
    `java-library`
}

java {
    // Android's D8 reads Java 17 bytecode; the code uses only APIs Android has had since API 24.
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

tasks.withType<JavaCompile>().configureEach {
    // Sources are ASCII; this keeps any non-ASCII test text the same on every machine.
    options.encoding = "UTF-8"
}

dependencies {
    // X25519, AES-GCM, SHA-256, HMAC and BLAKE3 through the lightweight API. Exact version,
    // released 2026-09-11 (1.87 is a day old, too new to pick: CLAUDE.md).
    implementation("org.bouncycastle:bcprov-jdk18on:1.86")
    testImplementation("junit:junit:4.13.2")
}

tasks.test {
    // The interop test finds the repository's Node and the desktop agent's Mesh code from here.
    systemProperty("farbaek.repo", rootProject.projectDir.parentFile.absolutePath)
    testLogging {
        events("failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
