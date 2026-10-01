# Android APK

MOBDAW is packaged as a regular Android app that displays the bundled web app. It does not register as a home-screen replacement or handle the Android `HOME` intent.

From the repository root, install the web dependencies and build the debug APK:

```sh
npm ci
cd android
./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Building requires Java 17, Android SDK platform 36, Android Gradle Plugin 8.13.0, and Gradle 8.13. The Gradle build runs the Vite production build and packages its output into the APK. Microphone access is requested by Android when the app uses audio recording.
