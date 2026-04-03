package com.anonymous.clarivoice

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OngoingCallServiceModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "OngoingCallService"

  @ReactMethod
  fun startOngoingCallService(
    title: String?,
    subtitle: String?,
    isVideoCall: Boolean?,
    promise: Promise,
  ) {
    try {
      OngoingCallForegroundService.startService(
        reactApplicationContext,
        title,
        subtitle,
        isVideoCall == true,
      )
      Log.i(
        "OngoingCallServiceModule",
        "startOngoingCallService title=${title ?: "null"} isVideoCall=${isVideoCall == true}",
      )
      promise.resolve(
        buildStateMap(
          running = true,
          title = title ?: OngoingCallForegroundService.currentTitle,
          subtitle = subtitle ?: OngoingCallForegroundService.currentSubtitle,
        )
      )
    } catch (error: Throwable) {
      promise.reject("ONGOING_CALL_SERVICE_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stopOngoingCallService(
    _title: String?,
    _subtitle: String?,
    _isVideoCall: Boolean?,
    promise: Promise,
  ) {
    try {
      OngoingCallForegroundService.stopService(reactApplicationContext)
      Log.i("OngoingCallServiceModule", "stopOngoingCallService")
      promise.resolve(
        buildStateMap(
          running = false,
          title = null,
          subtitle = null,
        )
      )
    } catch (error: Throwable) {
      promise.reject("ONGOING_CALL_SERVICE_STOP_FAILED", error.message, error)
    }
  }

  private fun buildStateMap(
    running: Boolean = OngoingCallForegroundService.isRunning,
    title: String? = OngoingCallForegroundService.currentTitle,
    subtitle: String? = OngoingCallForegroundService.currentSubtitle,
  ) =
    Arguments.createMap().apply {
      putBoolean("running", running)
      putString("title", title)
      putString("subtitle", subtitle)
    }
}
