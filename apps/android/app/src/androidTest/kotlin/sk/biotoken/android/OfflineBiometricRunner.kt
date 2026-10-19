package sk.biotoken.android

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import androidx.test.runner.AndroidJUnitRunner

/** Explicit, test-APK-only entry point; never runs the production Application or other tests. */
class OfflineBiometricRunner : AndroidJUnitRunner() {
    override fun newApplication(cl: ClassLoader, className: String, context: Context): Application =
        super.newApplication(cl, Application::class.java.name, context)

    override fun onCreate(arguments: Bundle) {
        if (arguments.getString(OPT_IN) != "true") {
            finish(Activity.RESULT_CANCELED, Bundle().apply { putString(RESULT, "FAIL_OPT_IN_REQUIRED") })
            return
        }
        super.onCreate(
            Bundle().apply {
                putString(OPT_IN, "true")
                putString("class", OfflineBiometricPromptTest::class.java.name)
                putString("disableAnalytics", "true")
            }
        )
    }

    companion object {
        const val OPT_IN = "interactiveBiometric"
        const val RESULT = "offlineBiometric"
    }
}
