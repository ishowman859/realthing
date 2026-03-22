import Foundation
import React
import SystemConfiguration

/// 연결 중인 Wi-Fi의 SSID/BSSID (iOS 정책상 주변 스캔 목록은 불가).
/// `Access Wi-Fi Information` + 위치 권한이 있어야 값이 채워지는 경우가 많습니다.
@objc(VerityIosWifiInfo)
class VerityIosWifiInfo: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(getCurrentWifiInfo:rejecter:)
  func getCurrentWifiInfo(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    var ssid: String?
    var bssid: String?

    if let interfaces = CNCopySupportedInterfaces() as? [String] {
      for name in interfaces {
        guard let info = CNCopyCurrentNetworkInfo(name as CFString) as? [String: AnyObject] else {
          continue
        }
        ssid = info[kCNNetworkInfoKeySSID as String] as? String
        bssid = info[kCNNetworkInfoKeyBSSID as String] as? String
        if ssid != nil || bssid != nil {
          break
        }
      }
    }

    let payload: [String: Any] = [
      "ssid": ssid as Any,
      "bssid": bssid as Any,
      "available": (ssid != nil || bssid != nil),
    ]
    resolve(payload)
  }
}
