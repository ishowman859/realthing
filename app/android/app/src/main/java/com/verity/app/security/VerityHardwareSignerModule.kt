package com.verity.app.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.X509EncodedKeySpec

class VerityHardwareSignerModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  // [각주1] Android 하드웨어 키 저장소 식별자입니다.
  private val keyStoreProvider = "AndroidKeyStore"

  override fun getName(): String = "VerityHardwareSigner"

  // [각주2] alias별 키쌍을 StrongBox 기반으로 생성하고 공개키를 반환합니다.
  @ReactMethod
  fun createOrGetStrongBoxKey(alias: String, promise: Promise) {
    try {
      val keyStore = KeyStore.getInstance(keyStoreProvider).apply { load(null) }
      val existing = keyStore.getCertificate(alias)
      if (existing != null) {
        val pub = existing.publicKey.encoded
        promise.resolve(Base64.encodeToString(pub, Base64.NO_WRAP))
        return
      }

      val generator = KeyPairGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_EC,
        keyStoreProvider
      )

      val spec = KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
      )
        .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setUserAuthenticationRequired(false)
        .setIsStrongBoxBacked(true) // [각주3] StrongBox 사용을 강제합니다.
        .build()

      try {
        generator.initialize(spec)
        val pair = generator.generateKeyPair()
        promise.resolve(Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP))
      } catch (e: StrongBoxUnavailableException) {
        promise.reject(
          "ERR_STRONGBOX_UNAVAILABLE",
          "StrongBox를 사용할 수 없는 기기입니다.",
          e
        )
      }
    } catch (e: Exception) {
      promise.reject("ERR_KEY_CREATE", "StrongBox 키 생성 실패", e)
    }
  }

  // [각주4] alias 키의 공개키를 Base64(X.509 DER)로 반환합니다.
  @ReactMethod
  fun getPublicKey(alias: String, promise: Promise) {
    try {
      val keyStore = KeyStore.getInstance(keyStoreProvider).apply { load(null) }
      val cert = keyStore.getCertificate(alias)
      if (cert == null) {
        promise.reject("ERR_KEY_NOT_FOUND", "지정한 alias의 키가 없습니다.")
        return
      }
      promise.resolve(Base64.encodeToString(cert.publicKey.encoded, Base64.NO_WRAP))
    } catch (e: Exception) {
      promise.reject("ERR_GET_PUBLIC_KEY", "공개키 조회 실패", e)
    }
  }

  // [각주5] payload(Base64)를 SHA256withECDSA로 서명해 Base64 시그니처를 반환합니다.
  @ReactMethod
  fun sign(alias: String, payloadBase64: String, promise: Promise) {
    try {
      val keyStore = KeyStore.getInstance(keyStoreProvider).apply { load(null) }
      val privateKey = keyStore.getKey(alias, null)
      if (privateKey == null) {
        promise.reject("ERR_KEY_NOT_FOUND", "지정한 alias의 개인키가 없습니다.")
        return
      }

      val payload = Base64.decode(payloadBase64, Base64.DEFAULT)
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(privateKey as java.security.PrivateKey)
      signer.update(payload)
      val signature = signer.sign()

      promise.resolve(Base64.encodeToString(signature, Base64.NO_WRAP))
    } catch (e: Exception) {
      promise.reject("ERR_SIGN_FAILED", "StrongBox 서명 실패", e)
    }
  }

  // [각주6] 서명 검증을 네이티브에서 즉시 확인할 수 있도록 보조 메서드를 제공합니다.
  @ReactMethod
  fun verify(publicKeyBase64: String, payloadBase64: String, signatureBase64: String, promise: Promise) {
    try {
      val publicKeyBytes = Base64.decode(publicKeyBase64, Base64.DEFAULT)
      val payload = Base64.decode(payloadBase64, Base64.DEFAULT)
      val signature = Base64.decode(signatureBase64, Base64.DEFAULT)

      val keyFactory = KeyFactory.getInstance("EC")
      val keySpec = X509EncodedKeySpec(publicKeyBytes)
      val publicKey = keyFactory.generatePublic(keySpec) as ECPublicKey

      val verifier = Signature.getInstance("SHA256withECDSA")
      verifier.initVerify(publicKey)
      verifier.update(payload)
      promise.resolve(verifier.verify(signature))
    } catch (e: Exception) {
      promise.reject("ERR_VERIFY_FAILED", "서명 검증 실패", e)
    }
  }

  // [각주7] alias 키를 삭제해 키 롤오버/폐기 시나리오를 지원합니다.
  @ReactMethod
  fun deleteKey(alias: String, promise: Promise) {
    try {
      val keyStore = KeyStore.getInstance(keyStoreProvider).apply { load(null) }
      if (keyStore.containsAlias(alias)) {
        keyStore.deleteEntry(alias)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ERR_DELETE_KEY", "키 삭제 실패", e)
    }
  }
}
