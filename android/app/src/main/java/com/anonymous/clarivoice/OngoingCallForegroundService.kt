package com.anonymous.clarivoice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class OngoingCallForegroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action ?: ACTION_START

    return when (action) {
      ACTION_STOP -> {
        stopForegroundCompat()
        releaseWakeLock()
        isRunning = false
        currentTitle = null
        currentSubtitle = null
        currentIsVideoCall = false
        stopSelf()
        START_NOT_STICKY
      }

      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() }
          ?: DEFAULT_TITLE
        val subtitle = intent?.getStringExtra(EXTRA_SUBTITLE)?.takeIf { it.isNotBlank() }
          ?: DEFAULT_SUBTITLE
        val isVideoCall = intent?.getBooleanExtra(EXTRA_IS_VIDEO_CALL, false) == true

        ensureNotificationChannel()
        acquireWakeLock()
        startForegroundCompat(buildNotification(title, subtitle), isVideoCall)
        isRunning = true
        currentTitle = title
        currentSubtitle = subtitle
        currentIsVideoCall = isVideoCall
        Log.i(
          "OngoingCallForegroundService",
          "foreground started title=$title isVideoCall=$isVideoCall",
        )
        START_STICKY
      }
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    releaseWakeLock()
    isRunning = false
    currentTitle = null
    currentSubtitle = null
    currentIsVideoCall = false
  }

  private fun startForegroundCompat(notification: Notification, isVideoCall: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val serviceType =
        if (isVideoCall) {
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        } else {
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        }
      startForeground(NOTIFICATION_ID, notification, serviceType)
      return
    }

    startForeground(NOTIFICATION_ID, notification)
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      return
    }

    @Suppress("DEPRECATION")
    stopForeground(true)
  }

  private fun buildNotification(title: String, subtitle: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent =
      launchIntent?.let {
        PendingIntent.getActivity(
          this,
          0,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(subtitle)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existingChannel = manager.getNotificationChannel(CHANNEL_ID)
    if (existingChannel != null) {
      return
    }

    val channel =
      NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = CHANNEL_DESCRIPTION
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
        lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      }

    manager.createNotificationChannel(channel)
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) {
      return
    }

    try {
      val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
      wakeLock =
        powerManager.newWakeLock(
          PowerManager.PARTIAL_WAKE_LOCK,
          "clarivoice:ongoing_call_wakelock",
        ).apply {
          setReferenceCounted(false)
          acquire(6 * 60 * 60 * 1000L)
        }
    } catch (error: Throwable) {
      Log.w(
        "OngoingCallForegroundService",
        "Failed to acquire wake lock: ${error.message ?: "Unknown error"}",
      )
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) {
        wakeLock?.release()
      }
    } catch (_: Throwable) {
      // Ignore wake lock release exceptions to avoid crash on shutdown.
    } finally {
      wakeLock = null
    }
  }

  companion object {
    private const val ACTION_START = "clarivoice.ongoing_call.START"
    private const val ACTION_STOP = "clarivoice.ongoing_call.STOP"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_SUBTITLE = "subtitle"
    private const val EXTRA_IS_VIDEO_CALL = "isVideoCall"
    private const val CHANNEL_ID = "clarivoice_ongoing_call"
    private const val CHANNEL_NAME = "Ongoing call"
    private const val CHANNEL_DESCRIPTION = "Keeps active Clarivoice voice calls running"
    private const val NOTIFICATION_ID = 4902
    private const val DEFAULT_TITLE = "Clarivoice call in progress"
    private const val DEFAULT_SUBTITLE = "Voice call is active"

    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    var currentTitle: String? = null
      private set

    @Volatile
    var currentSubtitle: String? = null
      private set

    @Volatile
    var currentIsVideoCall: Boolean = false
      private set

    fun startService(
      context: Context,
      title: String?,
      subtitle: String?,
      isVideoCall: Boolean = false,
    ) {
      val intent =
        Intent(context, OngoingCallForegroundService::class.java).apply {
          action = ACTION_START
          putExtra(EXTRA_TITLE, title ?: DEFAULT_TITLE)
          putExtra(EXTRA_SUBTITLE, subtitle ?: DEFAULT_SUBTITLE)
          putExtra(EXTRA_IS_VIDEO_CALL, isVideoCall)
        }

      ContextCompat.startForegroundService(context, intent)
    }

    fun stopService(context: Context) {
      val intent =
        Intent(context, OngoingCallForegroundService::class.java).apply {
          action = ACTION_STOP
        }

      context.startService(intent)
    }
  }
}
