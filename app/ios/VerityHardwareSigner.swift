import Foundation
import Security
import React

@objc(VerityHardwareSigner)
class VerityHardwareSigner: NSObject {

  // [각주1] React Native가 모듈 초기화 시 메인 스레드 강제를 피하도록 false를 반환합니다.
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // [각주2] Secure Enclave 키를 생성하거나 기존 키를 재사용하고, 공개키를 Base64로 반환합니다.
  @objc(createOrGetSecureEnclaveKey:resolver:rejecter:)
  func createOrGetSecureEnclaveKey(
    alias: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      if let privateKey = try findPrivateKey(alias: alias),
         let publicKey = SecKeyCopyPublicKey(privateKey),
         let pubData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? {
        resolve(pubData.base64EncodedString())
        return
      }

      let access = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        .privateKeyUsage,
        nil
      )

      let tag = alias.data(using: .utf8) ?? Data()

      let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave, // [각주3] Secure Enclave 강제
        kSecPrivateKeyAttrs as String: [
          kSecAttrIsPermanent as String: true,
          kSecAttrApplicationTag as String: tag,
          kSecAttrAccessControl as String: access as Any
        ]
      ]

      var error: Unmanaged<CFError>?
      guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        let err = error?.takeRetainedValue()
        reject("ERR_KEY_CREATE", "Secure Enclave 키 생성 실패", err)
        return
      }

      guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
        reject("ERR_PUBLIC_KEY", "공개키 추출 실패", nil)
        return
      }

      var pubErr: Unmanaged<CFError>?
      guard let pubData = SecKeyCopyExternalRepresentation(publicKey, &pubErr) as Data? else {
        let err = pubErr?.takeRetainedValue()
        reject("ERR_PUBLIC_KEY", "공개키 직렬화 실패", err)
        return
      }

      resolve(pubData.base64EncodedString())
    } catch {
      reject("ERR_KEY_CREATE", "Secure Enclave 키 생성/조회 실패", error)
    }
  }

  // [각주4] payload(Base64)를 Secure Enclave 개인키로 ECDSA SHA-256 서명합니다.
  @objc(sign:payloadBase64:resolver:rejecter:)
  func sign(
    alias: String,
    payloadBase64: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let payload = Data(base64Encoded: payloadBase64) else {
      reject("ERR_BAD_INPUT", "payloadBase64 디코딩 실패", nil)
      return
    }

    do {
      guard let privateKey = try findPrivateKey(alias: alias) else {
        reject("ERR_KEY_NOT_FOUND", "지정한 alias의 키가 없습니다.", nil)
        return
      }

      var error: Unmanaged<CFError>?
      guard let signature = SecKeyCreateSignature(
        privateKey,
        .ecdsaSignatureMessageX962SHA256,
        payload as CFData,
        &error
      ) as Data? else {
        let err = error?.takeRetainedValue()
        reject("ERR_SIGN_FAILED", "Secure Enclave 서명 실패", err)
        return
      }

      resolve(signature.base64EncodedString())
    } catch {
      reject("ERR_SIGN_FAILED", "Secure Enclave 서명 실패", error)
    }
  }

  // [각주5] alias 키의 공개키를 Base64(X9.63)로 반환합니다.
  @objc(getPublicKey:resolver:rejecter:)
  func getPublicKey(
    alias: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      guard let privateKey = try findPrivateKey(alias: alias),
            let publicKey = SecKeyCopyPublicKey(privateKey) else {
        reject("ERR_KEY_NOT_FOUND", "지정한 alias의 키가 없습니다.", nil)
        return
      }

      var error: Unmanaged<CFError>?
      guard let pubData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
        let err = error?.takeRetainedValue()
        reject("ERR_GET_PUBLIC_KEY", "공개키 직렬화 실패", err)
        return
      }
      resolve(pubData.base64EncodedString())
    } catch {
      reject("ERR_GET_PUBLIC_KEY", "공개키 조회 실패", error)
    }
  }

  // [각주6] Secure Enclave 개인키 자체 삭제를 위해 Keychain 엔트리를 제거합니다.
  @objc(deleteKey:resolver:rejecter:)
  func deleteKey(
    alias: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let tag = alias.data(using: .utf8) ?? Data()
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom
    ]

    let status = SecItemDelete(query as CFDictionary)
    if status == errSecSuccess || status == errSecItemNotFound {
      resolve(true)
    } else {
      reject("ERR_DELETE_KEY", "키 삭제 실패 (\(status))", nil)
    }
  }

  private func findPrivateKey(alias: String) throws -> SecKey? {
    let tag = alias.data(using: .utf8) ?? Data()
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecReturnRef as String: true
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess {
      return (item as! SecKey)
    }
    if status == errSecItemNotFound {
      return nil
    }
    throw NSError(
      domain: "VerityHardwareSigner",
      code: Int(status),
      userInfo: [NSLocalizedDescriptionKey: "Keychain 조회 실패: \(status)"]
    )
  }
}
