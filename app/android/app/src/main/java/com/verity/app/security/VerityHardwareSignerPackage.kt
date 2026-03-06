package com.verity.app.security

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class VerityHardwareSignerPackage : ReactPackage {
  // [각주1] RN 브릿지에서 VerityHardwareSigner 모듈을 등록합니다.
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(VerityHardwareSignerModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
