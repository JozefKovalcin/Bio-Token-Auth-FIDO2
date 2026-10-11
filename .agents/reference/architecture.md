# Architektúra

Pozri [projekt](../../docs/architecture.md) a [Android plán](../../apps/android/README.md). Android je zatiaľ scaffold v apps/android. Kotlin logiku oddeľte od platformovej biometrie a Keystore. UI prijíma immutable state a callbacks; state holder spravuje lifecycle, Flow a efekty. Upstream generátor tu neexistuje; pred pridaním modulov navrhnite skutočný build a namespace projektu.
