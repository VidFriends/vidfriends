// Receives UnifiedPush events (ADR-0024). The connector has already decrypted the message
// (RFC 8291). Payloads hold a generic title and an in-app path only (BR-NOT-3).
package io.github.vidfriends.unifiedpush

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

class VidFriendsPushService : PushService() {
  override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
    val keys = endpoint.pubKeySet ?: return
    Endpoints.save(this, endpoint.url, keys.pubKey, keys.auth)
    UnifiedPushModule.emit(
      "onNewEndpoint",
      mapOf("url" to endpoint.url, "p256dh" to keys.pubKey, "auth" to keys.auth),
    )
  }

  override fun onMessage(message: PushMessage, instance: String) {
    // Only messages encrypted for this app's keys are shown.
    if (!message.decrypted) return
    val json =
      try {
        JSONObject(String(message.content, Charsets.UTF_8))
      } catch (e: Exception) {
        return
      }
    val title = json.optString("title").ifBlank { return }
    val data = json.optJSONObject("data")
    val path = data?.optString("url").orEmpty()
    val tag = json.optString("tag").ifBlank { null }
    show(title, deepLink(path), tag)
  }

  override fun onRegistrationFailed(reason: FailedReason, instance: String) {
    UnifiedPushModule.emit("onRegistrationFailed", mapOf("reason" to reason.name))
  }

  override fun onUnregistered(instance: String) {
    Endpoints.clear(this)
    UnifiedPushModule.emit("onUnregistered", emptyMap())
  }

  /** In-app paths from the server map onto the app's routes (vidfriends://…). */
  private fun deepLink(path: String): Uri {
    val clean = path.trimStart('/')
    val route =
      when {
        clean.startsWith("shares/") -> "share/" + clean.removePrefix("shares/")
        clean.isEmpty() -> "notifications"
        else -> clean
      }
    return Uri.parse("vidfriends://$route")
  }

  private fun show(title: String, link: Uri, tag: String?) {
    val manager = NotificationManagerCompat.from(this)
    if (!manager.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val system = getSystemService(NotificationManager::class.java)
      if (system.getNotificationChannel(CHANNEL) == null) {
        system.createNotificationChannel(
          NotificationChannel(CHANNEL, "VidFriends", NotificationManager.IMPORTANCE_DEFAULT),
        )
      }
    }
    val open =
      Intent(Intent.ACTION_VIEW, link).apply {
        setPackage(packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
    val pending =
      PendingIntent.getActivity(
        this,
        link.hashCode(),
        open,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    val icon = applicationInfo.icon
    val notification =
      NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(icon)
        .setContentTitle("VidFriends")
        .setContentText(title)
        .setAutoCancel(true)
        .setContentIntent(pending)
        .build()
    try {
      manager.notify(tag, (tag ?: title).hashCode(), notification)
    } catch (e: SecurityException) {
      // Notifications permission was revoked.
    }
  }

  companion object {
    private const val CHANNEL = "unifiedpush"
  }
}
