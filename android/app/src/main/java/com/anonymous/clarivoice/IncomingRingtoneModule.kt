package com.anonymous.clarivoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class IncomingRingtoneModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val appContext = reactContext.applicationContext
  private val audioManager =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val focusChangeListener =
    AudioManager.OnAudioFocusChangeListener { _ -> }

  private var audioFocusRequest: AudioFocusRequest? = null
  private var mediaPlayer: MediaPlayer? = null
  private var activeSessionId: String? = null

  override fun getName(): String = "IncomingRingtoneManager"

  @ReactMethod
  fun startIncomingRingtone(sessionId: String?, promise: Promise) {
    val normalizedSessionId = sessionId?.trim()?.takeIf { it.isNotEmpty() } ?: "incoming-call"

    try {
      if (activeSessionId == normalizedSessionId && mediaPlayer?.isPlaying == true) {
        promise.resolve(buildStateMap("already_playing"))
        return
      }

      stopPlayer(clearSession = false)
      requestAudioFocus()

      val player =
        MediaPlayer().apply {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          setDataSource(appContext, resolveRingtoneUri())
          isLooping = true
          prepare()
          start()
        }

      mediaPlayer = player
      activeSessionId = normalizedSessionId

      promise.resolve(buildStateMap("started"))
    } catch (error: Throwable) {
      stopPlayer(clearSession = true)
      promise.reject("INCOMING_RINGTONE_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stopIncomingRingtone(sessionId: String?, promise: Promise) {
    val normalizedSessionId = sessionId?.trim()?.takeIf { it.isNotEmpty() }

    if (
      normalizedSessionId != null &&
        activeSessionId != null &&
        normalizedSessionId != activeSessionId
    ) {
      promise.resolve(buildStateMap("ignored_session_mismatch"))
      return
    }

    try {
      stopPlayer(clearSession = true)
      promise.resolve(buildStateMap("stopped"))
    } catch (error: Throwable) {
      promise.reject("INCOMING_RINGTONE_STOP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getIncomingRingtoneState(promise: Promise) {
    promise.resolve(buildStateMap("state"))
  }

  override fun invalidate() {
    stopPlayer(clearSession = true)
    super.invalidate()
  }

  private fun resolveRingtoneUri(): Uri {
    val actualUri =
      android.media.RingtoneManager.getActualDefaultRingtoneUri(
        appContext,
        android.media.RingtoneManager.TYPE_RINGTONE,
      )

    if (actualUri != null) {
      return actualUri
    }

    val defaultUri = android.media.RingtoneManager.getDefaultUri(
      android.media.RingtoneManager.TYPE_RINGTONE,
    )

    return defaultUri ?: Settings.System.DEFAULT_RINGTONE_URI
  }

  private fun requestAudioFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request =
        audioFocusRequest
          ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
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
      AudioManager.STREAM_RING,
      AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
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

  private fun stopPlayer(clearSession: Boolean) {
    mediaPlayer?.let { player ->
      try {
        if (player.isPlaying) {
          player.stop()
        }
      } catch (_: Throwable) {
        // Ignore stop failures while releasing the ringtone player.
      }

      try {
        player.reset()
      } catch (_: Throwable) {
        // Ignore reset failures while releasing the ringtone player.
      }

      try {
        player.release()
      } catch (_: Throwable) {
        // Ignore release failures while releasing the ringtone player.
      }
    }

    mediaPlayer = null

    if (clearSession) {
      activeSessionId = null
    }

    abandonAudioFocus()
  }

  private fun buildStateMap(status: String): WritableMap {
    val result = Arguments.createMap()
    result.putString("status", status)
    result.putBoolean("isPlaying", mediaPlayer?.isPlaying == true)
    result.putString("sessionId", activeSessionId)
    return result
  }
}
