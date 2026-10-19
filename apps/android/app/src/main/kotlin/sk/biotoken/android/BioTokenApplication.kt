package sk.biotoken.android

import android.app.Application
import sk.biotoken.android.security.DeviceKeys
import sk.biotoken.android.security.DeviceStore

class BioTokenApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Once per process, not on Activity recreation while pairing keys are still in use.
        val stored = DeviceStore(this).load(BuildConfig.SERVICE_ORIGIN)
        DeviceKeys().removeOrphaned(stored?.keyAliasPrefix)
    }
}
