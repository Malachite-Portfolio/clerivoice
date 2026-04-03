package com.anonymous.clarivoice

import android.app.Application
import android.content.res.Configuration
import android.util.Log

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.chatsdk.ChatSdkPackage
import io.agora.rtc.ng.react.AgoraRtcNgPackage

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  private fun MutableList<ReactPackage>.ensurePackage(
    className: String,
    provider: () -> ReactPackage,
  ) {
    if (none { it.javaClass.name == className }) {
      add(provider())
    }
  }

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Keep explicit fallback package registration for release stability.
          ensurePackage(AgoraRtcNgPackage::class.java.name) { AgoraRtcNgPackage() }
          ensurePackage(ChatSdkPackage::class.java.name) { ChatSdkPackage() }
          ensurePackage(CallAudioManagerPackage::class.java.name) { CallAudioManagerPackage() }
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    Log.i(
      "MainApplication",
      "RN package guard: Agora=${AgoraRtcNgPackage::class.java.name}, Chat=${ChatSdkPackage::class.java.name}",
    )
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
