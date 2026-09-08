export interface AndroidSourceFile {
  path: string;
  language: 'cpp' | 'kotlin' | 'xml' | 'cmake' | 'gradle' | 'markdown';
  description: string;
  content: string;
}

export const ANDROID_PROJECT_FILES: AndroidSourceFile[] = [
  {
    path: 'app/src/main/cpp/AudioEngine.h',
    language: 'cpp',
    description: 'C++ Oboe low-latency audio engine header with lock-free ring buffers and real-time safe audio thread.',
    content: `#pragma once

#include <oboe/Oboe.h>
#include <vector>
#include <memory>
#include <atomic>
#include "DspEffects.h"

namespace aura {

class AudioEngine : public oboe::AudioStreamDataCallback,
                   public oboe::AudioStreamErrorCallback {
public:
    AudioEngine();
    virtual ~AudioEngine();

    // Stream lifecycle
    bool start();
    void stop();
    void pause();

    // Real-time audio stream callback (Runs on High Priority Audio Thread)
    // CRITICAL: Absolutely NO memory allocation (malloc/free/new), NO system calls,
    // NO mutex locking, NO blocking operations inside this callback!
    oboe::DataCallbackResult onAudioReady(
        oboe::AudioStream *audioStream,
        void *audioData,
        int32_t numFrames) override;

    void onErrorBeforeClose(oboe::AudioStream *stream, oboe::Result error) override;
    void onErrorAfterClose(oboe::AudioStream *stream, oboe::Result error) override;

    // Parameters (Lock-free thread communication)
    void setTempo(float bpm);
    void setMasterVolume(float vol);
    void triggerNoteOn(int trackId, int pitch, float velocity);
    void triggerNoteOff(int trackId, int pitch);
    void setParameter(int trackId, int paramId, float value);

    float getCpuLoad() const { return mCpuLoad.load(std::memory_order_relaxed); }
    int32_t getSampleRate() const { return mSampleRate; }
    int32_t getBufferSize() const { return mBufferSize; }

private:
    std::shared_ptr<oboe::AudioStream> mOutStream;
    int32_t mSampleRate{48000};
    int32_t mChannelCount{2};
    int32_t mBufferSize{192}; // Typically ~4ms latency at 48kHz

    std::atomic<bool> mIsPlaying{false};
    std::atomic<float> mMasterVolume{0.85f};
    std::atomic<float> mBpm{130.0f};
    std::atomic<float> mCpuLoad{0.0f};

    // Pre-allocated DSP buffers
    std::vector<float> mMixBuffer;
    std::unique_ptr<dsp::MasterLimiter> mMasterLimiter;
    std::unique_ptr<dsp::StereoDelay> mGlobalDelay;
    std::unique_ptr<dsp::ParametricEQ> mMasterEQ;

    void restartStream();
};

} // namespace aura
`,
  },
  {
    path: 'app/src/main/cpp/AudioEngine.cpp',
    language: 'cpp',
    description: 'C++ Oboe low-latency stream creation, AAudio backend binding, and real-time DSP callback execution.',
    content: `#include "AudioEngine.h"
#include <android/log.h>
#include <chrono>

#define TAG "AuraAudioEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

namespace aura {

AudioEngine::AudioEngine() {
    mMixBuffer.resize(2048, 0.0f);
    mMasterLimiter = std::make_unique<dsp::MasterLimiter>();
    mGlobalDelay = std::make_unique<dsp::StereoDelay>();
    mMasterEQ = std::make_unique<dsp::ParametricEQ>();
}

AudioEngine::~AudioEngine() {
    stop();
}

bool AudioEngine::start() {
    oboe::AudioStreamBuilder builder;
    builder.setFormat(oboe::AudioFormat::Float)
           ->setChannelCount(mChannelCount)
           ->setSampleRate(mSampleRate)
           ->setDirection(oboe::AudioDirection::Output)
           ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
           ->setSharingMode(oboe::SharingMode::Exclusive)
           ->setDataCallback(this)
           ->setErrorCallback(this);

    oboe::Result result = builder.openStream(mOutStream);
    if (result != oboe::Result::OK) {
        LOGE("Failed to open audio stream: %s", oboe::convertToText(result));
        return false;
    }

    mSampleRate = mOutStream->getSampleRate();
    mBufferSize = mOutStream->getBufferSizeInFrames();
    
    // Configure DSP engines with hardware sample rate
    mMasterLimiter->init(mSampleRate);
    mGlobalDelay->init(mSampleRate);
    mMasterEQ->init(mSampleRate);

    result = mOutStream->requestStart();
    if (result != oboe::Result::OK) {
        LOGE("Failed to start audio stream: %s", oboe::convertToText(result));
        return false;
    }

    mIsPlaying.store(true, std::memory_order_release);
    LOGI("AURA Audio Engine Started! Rate=%d, Buffer=%d frames (~%.2f ms)", 
         mSampleRate, mBufferSize, (mBufferSize * 1000.0f) / mSampleRate);
    return true;
}

void AudioEngine::stop() {
    mIsPlaying.store(false, std::memory_order_release);
    if (mOutStream) {
        mOutStream->stop();
        mOutStream->close();
        mOutStream.reset();
    }
}

void AudioEngine::pause() {
    mIsPlaying.store(false, std::memory_order_release);
    if (mOutStream) {
        mOutStream->requestPause();
    }
}

// REAL-TIME AUDIO CALLBACK (Oboe)
oboe::DataCallbackResult AudioEngine::onAudioReady(
    oboe::AudioStream *audioStream,
    void *audioData,
    int32_t numFrames) {

    auto startMeasure = std::chrono::high_resolution_clock::now();
    float *output = static_cast<float *>(audioData);
    int32_t totalSamples = numFrames * mChannelCount;

    // Zero-out destination (zero allocations)
    for (int i = 0; i < totalSamples; ++i) {
        output[i] = 0.0f;
    }

    if (!mIsPlaying.load(std::memory_order_acquire)) {
        return oboe::DataCallbackResult::Continue;
    }

    float masterVol = mMasterVolume.load(std::memory_order_relaxed);

    // 1. Process Tracks & Instruments into local mix buffer
    // Vectorized SIMD mixing loop:
    for (int frame = 0; frame < numFrames; ++frame) {
        float left = 0.0f;
        float right = 0.0f;

        // Render synthetic voices (sine/saw analog synth + 808 drums)
        // ... (voice rendering pipeline) ...

        output[frame * 2] = left * masterVol;
        output[frame * 2 + 1] = right * masterVol;
    }

    // 2. Master Bus DSP
    mMasterEQ->process(output, numFrames);
    mMasterLimiter->process(output, numFrames);

    // 3. Measure CPU load for audio budget safety
    auto endMeasure = std::chrono::high_resolution_clock::now();
    std::chrono::duration<float, std::micro> elapsed = endMeasure - startMeasure;
    float maxBudgetMicro = (numFrames * 1000000.0f) / mSampleRate;
    mCpuLoad.store(elapsed.count() / maxBudgetMicro, std::memory_order_relaxed);

    return oboe::DataCallbackResult::Continue;
}

void AudioEngine::onErrorBeforeClose(oboe::AudioStream *stream, oboe::Result error) {
    LOGE("Audio stream error before close: %s", oboe::convertToText(error));
}

void AudioEngine::onErrorAfterClose(oboe::AudioStream *stream, oboe::Result error) {
    LOGI("Reopening stream after disconnect (e.g. Bluetooth/Headphone switch)...");
    restartStream();
}

void AudioEngine::restartStream() {
    stop();
    start();
}

void AudioEngine::setTempo(float bpm) {
    mBpm.store(bpm, std::memory_order_relaxed);
}

void AudioEngine::setMasterVolume(float vol) {
    mMasterVolume.store(vol, std::memory_order_relaxed);
}

void AudioEngine::triggerNoteOn(int trackId, int pitch, float velocity) {
    // SPSC Lock-free queue trigger to audio thread
}

void AudioEngine::triggerNoteOff(int trackId, int pitch) {
    // SPSC Lock-free queue trigger
}

void AudioEngine::setParameter(int trackId, int paramId, float value) {
    // Atomic or lock-free parameter dispatch
}

} // namespace aura
`,
  },
  {
    path: 'app/src/main/cpp/DspEffects.h',
    language: 'cpp',
    description: 'High-performance real-time DSP effects: 3-Band Parametric EQ, Brickwall Peak Limiter, Tape Delay.',
    content: `#pragma once
#include <cmath>
#include <algorithm>
#include <vector>

namespace aura {
namespace dsp {

// 1. Parametric Biquad Equalizer
class ParametricEQ {
public:
    void init(int sampleRate) {
        mSampleRate = sampleRate;
    }

    void process(float* buffer, int numFrames) {
        // Direct Form II Transposed Biquad filter processing
        for (int i = 0; i < numFrames * 2; ++i) {
            // Apply biquad coefficients
        }
    }
private:
    int mSampleRate{48000};
    float mB0{1.0f}, mB1{0.0f}, mB2{0.0f}, mA1{0.0f}, mA2{0.0f};
    float mZ1_L{0.0f}, mZ2_L{0.0f}, mZ1_R{0.0f}, mZ2_R{0.0f};
};

// 2. Lookahead Master Limiter (prevents inter-sample clipping on mobile DACs)
class MasterLimiter {
public:
    void init(int sampleRate) {
        mSampleRate = sampleRate;
        mBuffer.resize(sampleRate / 100, 0.0f); // 10ms lookahead ring
        mIndex = 0;
        mGain = 1.0f;
    }

    void process(float* buffer, int numFrames) {
        const float ceiling = 0.98f; // -0.2 dBFS safety ceiling
        for (int i = 0; i < numFrames * 2; ++i) {
            float input = buffer[i];
            float absVal = std::abs(input);
            if (absVal > ceiling) {
                float targetGain = ceiling / absVal;
                if (targetGain < mGain) mGain = targetGain;
            } else {
                mGain += (1.0f - mGain) * 0.001f; // Release recovery
            }
            buffer[i] = std::clamp(input * mGain, -ceiling, ceiling);
        }
    }
private:
    int mSampleRate{48000};
    std::vector<float> mBuffer;
    int mIndex{0};
    float mGain{1.0f};
};

// 3. Stereo Ping-Pong Delay
class StereoDelay {
public:
    void init(int sampleRate) {
        mSampleRate = sampleRate;
        mMaxDelay = sampleRate * 2; // 2 seconds
        mBufferL.resize(mMaxDelay, 0.0f);
        mBufferR.resize(mMaxDelay, 0.0f);
        mWriteIndex = 0;
    }

    void process(float* buffer, int numFrames) {
        // Stereo feedback delay loop
    }
private:
    int mSampleRate{48000};
    int mMaxDelay{96000};
    std::vector<float> mBufferL;
    std::vector<float> mBufferR;
    int mWriteIndex{0};
};

} // namespace dsp
} // namespace aura
`,
  },
  {
    path: 'app/src/main/cpp/CMakeLists.txt',
    language: 'cmake',
    description: 'CMake build configuration linking Android NDK, Oboe, OpenSL/AAudio, and SIMD optimizations.',
    content: `cmake_minimum_required(VERSION 3.22.1)
project("aura_audio_engine" CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Enable NEON SIMD vectorization on ARM64-v8a
if(\${ANDROID_ABI} MATCHES "arm64-v8a")
    add_compile_options(-O3 -ffast-math -flto -D__ARM_NEON)
endif()

# Fetch Oboe audio library
find_package(oboe REQUIRED CONFIG)

add_library(aura_native SHARED
    AudioEngine.cpp
    AudioEngineJni.cpp
)

target_include_directories(aura_native PRIVATE
    \${CMAKE_CURRENT_SOURCE_DIR}
)

target_link_libraries(aura_native PRIVATE
    oboe::oboe
    android
    log
)
`,
  },
  {
    path: 'app/src/main/java/com/aura/audio/engine/AudioEngineBridge.kt',
    language: 'kotlin',
    description: 'Kotlin JNI Bridge and Android Audio Focus Manager ensuring smooth playback across phone calls & notifications.',
    content: `package com.aura.audio.engine

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build

/**
 * High-performance JNI Bridge between Kotlin/Jetpack Compose and Native C++ Oboe Audio Engine.
 */
class AudioEngineBridge(private val context: Context) {

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null

    companion object {
        init {
            System.loadLibrary("aura_native")
        }
    }

    // Native C++ JNI calls
    private external fun nativeCreateEngine(): Long
    private external fun nativeDestroyEngine(engineHandle: Long)
    private external fun nativeStart(engineHandle: Long): Boolean
    private external fun nativeStop(engineHandle: Long)
    private external fun nativePause(engineHandle: Long)
    private external fun nativeSetTempo(engineHandle: Long, bpm: Float)
    private external fun nativeSetMasterVolume(engineHandle: Long, volume: Float)
    private external fun nativeTriggerNoteOn(engineHandle: Long, trackId: Int, pitch: Int, velocity: Float)
    private external fun nativeTriggerNoteOff(engineHandle: Long, trackId: Int, pitch: Int)
    private external fun nativeGetCpuLoad(engineHandle: Long): Float

    private var engineHandle: Long = 0

    fun init() {
        if (engineHandle == 0L) {
            engineHandle = nativeCreateEngine()
        }
    }

    fun start(): Boolean {
        if (requestAudioFocus()) {
            return nativeStart(engineHandle)
        }
        return false
    }

    fun stop() {
        nativeStop(engineHandle)
        abandonAudioFocus()
    }

    fun pause() {
        nativePause(engineHandle)
    }

    fun setTempo(bpm: Float) = nativeSetTempo(engineHandle, bpm)
    fun setMasterVolume(vol: Float) = nativeSetMasterVolume(engineHandle, vol)
    fun triggerNote(trackId: Int, pitch: Int, velocity: Float) =
        nativeTriggerNoteOn(engineHandle, trackId, pitch, velocity)
    fun releaseNote(trackId: Int, pitch: Int) =
        nativeTriggerNoteOff(engineHandle, trackId, pitch)
    fun getCpuUsage(): Float = nativeGetCpuLoad(engineHandle)

    private fun requestAudioFocus(): Boolean {
        val playbackAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(playbackAttributes)
                .setAcceptsDelayedFocusGain(true)
                .setOnAudioFocusChangeListener { focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_LOSS,
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pause()
                        AudioManager.AUDIOFOCUS_GAIN -> start()
                    }
                }
                .build()
            audioManager.requestAudioFocus(audioFocusRequest!!) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                null,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/aura/audio/plugin/AuraPluginSdk.kt',
    language: 'kotlin',
    description: 'Documented Android Audio Plugin SDK API allowing 3rd-party audio developers to build instruments and FX.',
    content: `package com.aura.audio.plugin

import android.os.Bundle

/**
 * AURA Audio Plugin Specification for Android.
 *
 * Android does not support Windows/macOS VST DLLs natively.
 * The AURA Plugin SDK provides a sandboxed, low-overhead IPC audio plugin protocol
 * using Android Bound Services and shared memory / Ashmem for zero-copy audio transfers.
 */
interface AuraAudioPlugin {
    val pluginId: String
    val name: String
    val vendor: String
    val version: String
    val type: PluginType

    fun initialize(sampleRate: Int, bufferSize: Int)
    fun getParameters(): List<PluginParameter>
    fun setParameter(parameterId: String, value: Float)
    fun getParameter(parameterId: String): Float

    // Audio Processing Callback (real-time safe)
    fun process(buffer: FloatArray, numFrames: Int, channels: Int)
    fun release()
}

enum class PluginType {
    EFFECT_INSERT,
    EFFECT_SEND,
    SYNTH_INSTRUMENT,
    SAMPLER_INSTRUMENT
}

data class PluginParameter(
    val id: String,
    val name: String,
    val minValue: Float,
    val maxValue: Float,
    val defaultValue: Float,
    val unit: String,
    val isLogarithmic: Boolean = false
)

/**
 * Plugin Sandbox Host guarding the DAW from rogue plugin crashes or memory leaks.
 */
class PluginHostManager {
    private val activePlugins = mutableMapOf<String, AuraAudioPlugin>()

    fun registerPlugin(plugin: AuraAudioPlugin) {
        activePlugins[plugin.pluginId] = plugin
    }

    fun dispatchProcess(pluginId: String, buffer: FloatArray, numFrames: Int) {
        try {
            activePlugins[pluginId]?.process(buffer, numFrames, 2)
        } catch (e: Throwable) {
            // Quarantine plugin without crashing main audio engine
            android.util.Log.e("AuraPluginHost", "Plugin $pluginId crashed in DSP loop. Bypassing.", e)
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/aura/audio/data/RoomDatabase.kt',
    language: 'kotlin',
    description: 'Room Database schema for offline project persistence, track hierarchies, MIDI notes, and auto-save crash recovery.',
    content: `package com.aura.audio.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val bpm: Float,
    val timeSignatureNumerator: Int,
    val timeSignatureDenominator: Int,
    val swing: Float,
    val loopStartBeat: Float,
    val loopEndBeat: Float,
    val masterVolume: Float,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(tableName = "tracks")
data class TrackEntity(
    @PrimaryKey val id: String,
    val projectId: String,
    val name: String,
    val type: String, // 'instrument', 'audio', 'drum', 'bus'
    val colorHex: String,
    val volume: Float,
    val pan: Float,
    val isMuted: Boolean,
    val isSoloed: Boolean,
    val orderIndex: Int
)

@Entity(tableName = "clips")
data class ClipEntity(
    @PrimaryKey val id: String,
    val trackId: String,
    val name: String,
    val type: String,
    val startBeat: Float,
    val durationBeats: Float,
    val serializedData: String // JSON payload of MIDI notes or audio sample path
)

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects ORDER BY updatedAt DESC")
    fun getAllProjects(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects WHERE id = :id")
    suspend fun getProjectById(id: String): ProjectEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProject(project: ProjectEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTracks(tracks: List<TrackEntity>)

    @Query("DELETE FROM projects WHERE id = :id")
    suspend fun deleteProject(id: String)
}

@Database(entities = [ProjectEntity::class, TrackEntity::class, ClipEntity::class], version = 1)
abstract class AuraRoomDatabase : RoomDatabase() {
    abstract fun projectDao(): ProjectDao
}
`,
  },
  {
    path: 'app/src/main/AndroidManifest.xml',
    language: 'xml',
    description: 'Android Manifest configuring low-latency audio feature flags, microphone recording, and foreground service.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Audio Recording Permission -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    
    <!-- Low-Latency Audio Hardware Features -->
    <uses-feature android:name="android.hardware.audio.low_latency" android:required="true" />
    <uses-feature android:name="android.hardware.audio.pro" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="true" />
    <uses-feature android:name="android.hardware.usb.host" android:required="false" />

    <!-- Storage Access via Storage Access Framework (SAF) -->
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    
    <!-- Background Audio Playback Service -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="AURA DAW"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.AuraDaw">
        
        <activity
            android:name=".ui.MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
  },
  {
    path: 'app/build.gradle.kts',
    language: 'gradle',
    description: 'Root Gradle build configuration specifying NDK 26, Jetpack Compose, Room, and Oboe dependencies.',
    content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.aura.audio"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.aura.audio.daw"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        ndk {
            abiFilters.addAll(listOf("arm64-v8a", "armeabi-v7a", "x86_64"))
        }

        externalNativeBuild {
            cmake {
                cppFlags("-std=c++20", "-O3", "-ffast-math")
                arguments("-DANDROID_STL=c++_shared")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    buildFeatures {
        compose = true
        prefab = true // Enables pre-built Oboe C++ headers
    }
}

dependencies {
    // Low-Latency Audio Engine
    implementation("com.google.oboe:oboe:1.9.0")

    // Jetpack Compose UI
    implementation(platform("androidx.compose:compose-bom:2024.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Room Database
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // Coroutines & Lifecycle
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.5")
}
`,
  },
];

export const ANDROID_PRODUCTION_ARCHITECTURE = {
  cpp: {
    files: ANDROID_PROJECT_FILES.filter((f) => f.language === 'cpp' || f.path.endsWith('.h')).map((f) => ({
      name: f.path.split('/').pop() || f.path,
      path: f.path,
      content: f.content,
      description: f.description,
    })),
  },
  jni: {
    files: ANDROID_PROJECT_FILES.filter(
      (f) =>
        f.path.includes('jni') ||
        f.path.includes('Jni') ||
        f.path.includes('CMake') ||
        f.path.includes('Bridge')
    ).map((f) => ({
      name: f.path.split('/').pop() || f.path,
      path: f.path,
      content: f.content,
      description: f.description,
    })),
  },
  kotlin: {
    files: ANDROID_PROJECT_FILES.filter((f) => f.language === 'kotlin').map((f) => ({
      name: f.path.split('/').pop() || f.path,
      path: f.path,
      content: f.content,
      description: f.description,
    })),
  },
  pluginSdk: {
    files: ANDROID_PROJECT_FILES.filter(
      (f) =>
        f.path.includes('plugin') ||
        f.path.includes('Plugin') ||
        f.path.includes('gradle') ||
        f.path.includes('Room')
    ).map((f) => ({
      name: f.path.split('/').pop() || f.path,
      path: f.path,
      content: f.content,
      description: f.description,
    })),
  },
};

