package com.davidevans.pardonme

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  /**
   * True when this activity was brought up by an incoming fake call rather
   * than by the user tapping the launcher icon.
   *
   * It decides what happens when the call ends: a call-launched session should
   * vanish and hand the phone back to whatever the user was doing (exactly
   * like a real call), while an icon-launched session should stay on the home
   * screen. Without this the app popped its own GUI open after every call,
   * which is both jarring and a giveaway.
   */
  @Volatile
  private var launchedForCall = false

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    applyIncomingCallWindowFlags(intent)
    // Armed-by-default: bring the trigger up on every launch unless the user
    // has explicitly disarmed it.
    StealthTriggerService.armIfEnabled(this)
    activeInstance = this
  }

  override fun onDestroy() {
    if (activeInstance === this) activeInstance = null
    super.onDestroy()
  }

  /**
   * Called when the fake call finishes. If the call is what opened the app,
   * drop straight back to the previous app / launcher without ever showing the
   * PardonMe UI.
   */
  fun leaveIfCallLaunched() {
    if (!launchedForCall) return
    launchedForCall = false
    runOnUiThread {
      try {
        restoreSystemBars()
        // moveTaskToBack keeps the process (and the armed trigger) alive,
        // unlike finish(), while removing the app from view.
        moveTaskToBack(true)
      } catch (_: Exception) {}
    }
  }

  /** Put the status/navigation bars back for normal app use. */
  private fun restoreSystemBars() {
    try {
      WindowInsetsControllerCompat(window, window.decorView)
        .show(WindowInsetsCompat.Type.systemBars())
      WindowCompat.setDecorFitsSystemWindows(window, true)
    } catch (_: Exception) {}
  }

  companion object {
    /** Current activity, so the native module can reach these helpers. */
    @Volatile
    var activeInstance: MainActivity? = null
      private set
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyIncomingCallWindowFlags(intent)
  }

  /**
   * When launched by the call notification's full-screen intent, turn the screen
   * on and show over the keyguard so the call UI appears on a locked phone.
   * Without these flags Android silently drops the activity behind the lock
   * screen and only the notification is seen.
   */
  private fun applyIncomingCallWindowFlags(intent: Intent?) {
    val isIncoming = intent?.getBooleanExtra(IncomingCallModule.EXTRA_INCOMING, false) == true
    if (!isIncoming) return

    // Remember that a call — not the user — opened this session.
    launchedForCall = true

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      // Dismisses only a swipe keyguard; a PIN/pattern stays protected, which
      // is correct — the call UI shows above it.
      km.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
    }
    goImmersive()
  }

  /**
   * Hide the system bars for the call UI.
   *
   * Doing this natively (rather than only from JS on mount) matters: the JS
   * call arrives a few frames late, and in that gap Android draws its white
   * navigation bar across the bottom of the "incoming call" screen, which
   * looks obviously fake. Setting it here means the very first frame is
   * already edge-to-edge black.
   */
  private fun goImmersive() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.TRANSPARENT
    WindowInsetsControllerCompat(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior =
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is
   * used to schedule rendering of the component.
   *
   * NOTE: volume-key capture deliberately does NOT live here. An Activity only
   * receives KeyEvents while it is in the foreground, which is the opposite of
   * what PardonMe needs. See StealthTriggerService for the MediaSession-based
   * background capture.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
