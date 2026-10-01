plugins {
    id("com.android.application")
}

android {
    namespace = "com.mobdaw.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mobdaw.app"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
}

val webRoot = rootProject.projectDir.parentFile
val webDist = webRoot.resolve("dist")
val webAssets = layout.buildDirectory.dir("generated/webAssets")

tasks.register<Exec>("buildWebApp") {
    workingDir(webRoot)
    commandLine(if (System.getProperty("os.name").startsWith("Windows")) "npm.cmd" else "npm", "run", "build")
    inputs.files(
        fileTree(webRoot.resolve("src")),
        fileTree(webRoot.resolve("public")),
        webRoot.resolve("index.html"),
        webRoot.resolve("package.json"),
        webRoot.resolve("vite.config.ts"),
    )
    outputs.dir(webDist)
}

android.sourceSets.getByName("main").assets.srcDir(webAssets)

tasks.register<Sync>("packageWebApp") {
    dependsOn("buildWebApp")
    from(webDist)
    into(webAssets)
}

tasks.named("preBuild").configure {
    dependsOn("packageWebApp")
}
