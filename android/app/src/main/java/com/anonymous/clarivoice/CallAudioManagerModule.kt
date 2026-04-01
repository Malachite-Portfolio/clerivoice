package com.anonymous.clarivoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class CallAudioManagerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val audioManager =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val focusChangeListener =
    AudioManager.OnAudioFocusChangeListener { _ -> }

  private var audioFocusRequest: AudioFocusRequest? = null

  override fun getName(): String = "CallAudioManager"

  @ReactMethod
  fun startCommunicationAudio(speakerOn: Boolean, promise: Promise) {
    applyCommunicationRoute(speakerOn, promise)
  }

  @ReactMethod
  fun setSpeakerRoute(speakerOn: Boolean, promise: Promise) {
    applyCommunicationRoute(speakerOn, promise)
  }

  @ReactMethod
  fun stopCommunicationAudio(promise: Promise) {
    try {
      stopBluetoothScoSafely()
      audioManager.isBluetoothScoOn = false
      audioManager.isSpeakerphoneOn = false
      audioManager.isMicrophoneMute = false
      audioManager.mode = AudioManager.MODE_NORMAL
      abandonAudioFocus()
      promise.resolve(buildAudioStateMap())
    } catch (error: Throwable) {
      promise.reject("CALL_AUDIO_STOP_FAILED", error.message, error)
    }
  }

  private fun applyCommunicationRoute(speakerOn: Boolean, promise: Promise) {
    try {
      requestAudioFocus()
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      audioManager.isMicrophoneMute = false
      stopBluetoothScoSafely()
      audioManager.isBluetoothScoOn = false
      audioManager.isSpeakerphoneOn = speakerOn
      promise.resolve(buildAudioStateMap())
    } catch (error: Throwable) {
      promise.reject("CALL_AUDIO_ROUTE_FAILED", error.message, error)
    }
  }

  private fun requestAudioFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request =
        audioFocusRequest
          ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            )
            .setAcceptsDelayedFocusGain(false)
            .setOnAudioFocusChangeListener(focusChangeListener)
            .build()
            .also { audioFocusRequest = it }

      audioManager.requestAudioFocus(request)
      return
    }

    @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(
      focusChangeListener,
      AudioManager.STREAM_VOICE_CALL,
      AudioManager.AUDIOFOCUS_GAIN,
    )
  }

  private fun abandonAudioFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
      return
    }

    @Suppress("DEPRECATION")
    audioManager.abandonAudioFocus(focusChangeListener)
  }

  private fun stopBluetoothScoSafely() {
    try {
      audioManager.stopBluetoothSco()
    } catch (_: Throwable) {
      // Ignore Bluetooth SCO failures when no SCO route is active.
    }
  }

  private fun buildAudioStateMap(): WritableMap {
    val result = Arguments.createMap()
    result.putBoolean("speakerOn", audioManager.isSpeakerphoneOn)
    result.putBoolean("microphoneMuted", audioManager.isMicrophoneMute)
    result.putBoolean("bluetoothScoOn", audioManager.isBluetoothScoOn)
    result.putInt("mode", audioManager.mode)
    return result
  }
}
