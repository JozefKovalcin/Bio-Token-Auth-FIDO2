package sk.biotoken.android.security

import android.content.Context
import sk.biotoken.core.PairedDeviceStore
import sk.biotoken.core.StoredDevice

/** Stores public identifiers only. Capabilities, signatures and private keys are never persisted. */
class DeviceStore(context: Context) : PairedDeviceStore {
    private val preferences = context.getSharedPreferences("paired-device", Context.MODE_PRIVATE)

    override fun load(origin: String): StoredDevice? {
        if (preferences.getString("origin", null) != origin) return null
        return StoredDevice(
            preferences.getString("deviceId", null) ?: return null,
            preferences.getString("keyAliasPrefix", null) ?: return null,
            origin,
            preferences.getString("confirmationCode", "").orEmpty()
        )
    }

    override fun save(device: StoredDevice) {
        check(
            preferences
                .edit()
                .putString("origin", device.origin)
                .putString("deviceId", device.deviceId)
                .putString("keyAliasPrefix", device.keyAliasPrefix)
                .putString("confirmationCode", device.confirmationCode)
                .commit()
        )
    }

    override fun clear() {
        check(preferences.edit().clear().commit())
    }
}
