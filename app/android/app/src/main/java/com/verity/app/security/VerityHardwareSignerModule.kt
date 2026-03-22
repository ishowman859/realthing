package com.verity.app.security

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.concurrent.Executors

/**
 * Android Keystore EC P-256 키(가능 시 StrongBox)로 ECDSA SHA-256 서명.
 * 공개키는 iOS Secure Enclave와 동일하게 비압축 EC 포인트(0x04||x||y) Base64.
 */
class VerityHardwareSignerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "VerityHardwareSigner"

  override fun invalidate() {
    super.invalidate()
    executor.shutdown()
  }

  @ReactMethod
  fun createOrGetStrongBoxKey(alias: String, promise: Promise) {
    executor.execute {
      try {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!ks.containsAlias(alias)) {
          generateEcKey(alias)
        }
        val entry =
          ks.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
            ?: run {
              promise.reject("ERR_KEY_CREATE", "키 엔트리를 읽을 수 없습니다.", null)
              return@execute
            }
        val raw = exportUncompressedEcPoint(entry.certificate.publicKey)
        promise.resolve(
          android.util.Base64.encodeToString(raw, android.util.Base64.NO_WRAP)
        )
      } catch (e: Exception) {
        promise.reject("ERR_KEY_CREATE", e.message ?: "키 생성/조회 실패", e)
      }
    }
  }

  @ReactMethod
  fun createOrGetSecureEnclaveKey(_alias: String, promise: Promise) {
    promise.reject("ERR_PLATFORM", "Secure Enclave는 iOS 전용입니다.", null)
  }

  @ReactMethod
  fun sign(alias: String, payloadBase64: String, promise: Promise) {
    executor.execute {
      try {
        val payload =
          android.util.Base64.decode(payloadBase64, android.util.Base64.DEFAULT)
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val entry =
          ks.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
            ?: run {
              promise.reject("ERR_KEY_NOT_FOUND", "지정한 alias의 키가 없습니다.", null)
              return@execute
            }
        val sig = Signature.getInstance("SHA256withECDSA")
        sig.initSign(entry.privateKey)
        sig.update(payload)
        val out = sig.sign()
        promise.resolve(
          android.util.Base64.encodeToString(out, android.util.Base64.NO_WRAP)
        )
      } catch (e: Exception) {
        promise.reject("ERR_SIGN_FAILED", e.message ?: "서명 실패", e)
      }
    }
  }

  @ReactMethod
  fun getPublicKey(alias: String, promise: Promise) {
    executor.execute {
      try {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val entry =
          ks.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
            ?: run {
              promise.reject("ERR_KEY_NOT_FOUND", "지정한 alias의 키가 없습니다.", null)
              return@execute
            }
        val raw = exportUncompressedEcPoint(entry.certificate.publicKey)
        promise.resolve(
          android.util.Base64.encodeToString(raw, android.util.Base64.NO_WRAP)
        )
      } catch (e: Exception) {
        promise.reject("ERR_GET_PUBLIC_KEY", e.message ?: "공개키 조회 실패", e)
      }
    }
  }

  @ReactMethod
  fun deleteKey(alias: String, promise: Promise) {
    executor.execute {
      try {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!ks.containsAlias(alias)) {
          promise.resolve(true)
          return@execute
        }
        ks.deleteEntry(alias)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_DELETE_KEY", e.message ?: "키 삭제 실패", e)
      }
    }
  }

  private fun generateEcKey(alias: String) {
    if (Build.VERSION.SDK_INT >= 28) {
      try {
        doGenerate(alias, strongBox = true)
        return
      } catch (_: Exception) { }
    }
    doGenerate(alias, strongBox = false)
  }

  private fun doGenerate(alias: String, strongBox: Boolean) {
    val builder =
      KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
      )
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
    if (strongBox && Build.VERSION.SDK_INT >= 28) {
      builder.setIsStrongBoxBacked(true)
    }
    val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
    kpg.initialize(builder.build())
    kpg.generateKeyPair()
  }

  private fun exportUncompressedEcPoint(publicKey: java.security.PublicKey): ByteArray {
    val ec = publicKey as ECPublicKey
    val x = normalizeTo32(ec.w.affineX.toByteArray())
    val y = normalizeTo32(ec.w.affineY.toByteArray())
    return byteArrayOf(0x04) + x + y
  }

  private fun normalizeTo32(b: ByteArray): ByteArray {
    return when {
      b.size == 32 -> b
      b.size > 32 -> b.copyOfRange(b.size - 32, b.size)
      else -> ByteArray(32 - b.size) + b
    }
  }
}
