// UnifiedPush for VidFriends (ADR-0024): lists distributors, registers with the one the member
// picks, and reports the endpoint (with its Web Push keys) to JavaScript, which saves it on the
// server. Messages are shown by VidFriendsPushService, even when the app is not running.
package io.github.vidfriends.unifiedpush

import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.unifiedpush.android.connector.UnifiedPush

class UnifiedPushModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  override fun definition() = ModuleDefinition {
    Name("VidFriendsUnifiedPush")
    Events("onNewEndpoint", "onUnregistered", "onRegistrationFailed")

    OnCreate { current = this@UnifiedPushModule }
    OnDestroy { if (current === this@UnifiedPushModule) current = null }

    /** Installed distributors as {id, name} (package name and app label). */
    Function("getDistributors") {
      val pm = context.packageManager
      UnifiedPush.getDistributors(context).map { pkg ->
        val label =
          try {
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
          } catch (e: PackageManager.NameNotFoundException) {
            pkg
          }
        mapOf("id" to pkg, "name" to label)
      }
    }

    /** The distributor in use, or null. */
    Function("getDistributor") { UnifiedPush.getAckDistributor(context) }

    /** The last endpoint the distributor gave, so the app can re-save it after signing in. */
    Function("getEndpoint") { Endpoints.load(context) }

    Function("register") { distributor: String, vapid: String ->
      UnifiedPush.saveDistributor(context, distributor)
      UnifiedPush.register(context, vapid = vapid)
    }

    Function("unregister") {
      UnifiedPush.unregister(context)
      Endpoints.clear(context)
    }
  }

  companion object {
    @Volatile var current: UnifiedPushModule? = null

    fun emit(name: String, body: Map<String, Any?>) {
      current?.sendEvent(name, body)
    }
  }
}
