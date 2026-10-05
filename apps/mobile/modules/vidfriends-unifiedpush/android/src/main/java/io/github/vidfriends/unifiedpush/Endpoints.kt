package io.github.vidfriends.unifiedpush

import android.content.Context

/** The current endpoint and keys, kept so the app can save them on the server later. */
internal object Endpoints {
  private const val PREFS = "vidfriends.unifiedpush"

  fun save(context: Context, url: String, p256dh: String, auth: String) {
    context
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString("url", url)
      .putString("p256dh", p256dh)
      .putString("auth", auth)
      .apply()
  }

  fun load(context: Context): Map<String, String>? {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val url = p.getString("url", null) ?: return null
    val p256dh = p.getString("p256dh", null) ?: return null
    val auth = p.getString("auth", null) ?: return null
    return mapOf("url" to url, "p256dh" to p256dh, "auth" to auth)
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }
}
