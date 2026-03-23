package com.verity.app.location

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult as BleScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.location.GnssMeasurement
import android.location.GnssMeasurementsEvent
import android.location.Location
import android.net.wifi.ScanResult as WifiScanResult
import android.net.wifi.WifiManager
import android.os.Build
import android.telephony.CellIdentityGsm
import android.telephony.CellIdentityLte
import android.telephony.CellIdentityNr
import android.telephony.CellIdentityWcdma
import android.telephony.CellInfo
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.TelephonyManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.Tasks
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

/**
 * 촬영 시점 라디오 환경 raw: WiFi 스캔 + BLE 광고 스캔 + (실외) GNSS raw + Fused 위치.
 * WiFi/BLE/GNSS를 동시에 모은 뒤 하나의 스냅샷으로 반환합니다.
 */
class VerityRadioEnvironmentModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "VerityRadioEnvironment"

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun getRadioEnvironmentSnapshot(timeoutMs: Int, promise: Promise) {
    if (ActivityCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("E_PERMISSION", "ACCESS_FINE_LOCATION not granted", null)
      return
    }

    val timeout = timeoutMs.coerceIn(1500, 12000).toLong()
    val ui = Handler(Looper.getMainLooper())
    val appCtx = reactContext.applicationContext

    val wifiList = CopyOnWriteArrayList<WritableMap>()
    val bleByAddr = ConcurrentHashMap<String, WritableMap>()
    val gnssMeasurements = CopyOnWriteArrayList<WritableMap>()
    val gnssClockRef = arrayOf<WritableMap?>(null)
    val fusedClient = LocationServices.getFusedLocationProviderClient(reactContext)

    var gnssCallback: GnssMeasurementsEvent.Callback? = null
    var bleScanner: BluetoothLeScanner? = null
    var bleCb: ScanCallback? = null

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
      gnssCallback =
        object : GnssMeasurementsEvent.Callback() {
          override fun onGnssMeasurementsReceived(event: GnssMeasurementsEvent) {
            gnssClockRef[0] = gnssClockToMap(event.clock)
            for (measurement in event.measurements) {
              gnssMeasurements.add(gnssMeasurementToMap(measurement))
            }
          }
        }
      try {
        lm.registerGnssMeasurementsCallback(gnssCallback!!, ui)
      } catch (_: Exception) {
      }
    }

    if (canScanBle()) {
      try {
        val bm = appCtx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = bm.adapter
        if (adapter != null && adapter.isEnabled) {
          bleScanner = adapter.bluetoothLeScanner
          bleCb =
            object : ScanCallback() {
              override fun onScanResult(callbackType: Int, result: BleScanResult?) {
                if (result == null) return
                val m = bleResultToMap(result)
                val addr = m.getString("address") ?: return
                val prev = bleByAddr[addr]
                val prevRssi = prev?.getInt("rssi") ?: -999
                if (result.rssi > prevRssi) {
                  bleByAddr[addr] = m
                }
              }
            }
          val settings =
            ScanSettings.Builder()
              .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
              .build()
          bleScanner?.startScan(null, settings, bleCb!!)
        }
      } catch (_: Exception) {
      }
    }

    Thread {
      collectWifiScan(appCtx, wifiList)
    }.start()

    ui.postDelayed(
      {
        try {
          if (bleScanner != null && bleCb != null) {
            bleScanner?.stopScan(bleCb!!)
          }
        } catch (_: Exception) {
        }
        bleScanner = null
        bleCb = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && gnssCallback != null) {
          try {
            val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            lm.unregisterGnssMeasurementsCallback(gnssCallback!!)
          } catch (_: Exception) {
          }
        }
        gnssCallback = null

        Thread {
          val fusedMap = fetchFusedLocationMap(fusedClient, timeout.coerceAtMost(5000))
          val cellArr = collectCellScan(appCtx)
          val out = Arguments.createMap()
          out.putInt("collectionTimeoutMs", timeout.toInt())

          val wifiArr = Arguments.createArray()
          for (w in wifiList) wifiArr.pushMap(w)
          out.putArray("wifiScan", wifiArr)

          out.putArray("cellScan", cellArr)

          val bleArr = Arguments.createArray()
          for (b in bleByAddr.values.sortedBy { it.getString("address") }) {
            bleArr.pushMap(b)
          }
          out.putArray("bleBeacons", bleArr)

          val gnssBlock = Arguments.createMap()
          gnssBlock.putBoolean(
            "gnssRawSupported",
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
          )
          if (fusedMap != null) gnssBlock.putMap("fusedLocation", fusedMap)
          val gArr = Arguments.createArray()
          for (m in gnssMeasurements) gArr.pushMap(m)
          gnssBlock.putArray("gnssMeasurements", gArr)
          if (gnssClockRef[0] != null) gnssBlock.putMap("gnssClock", gnssClockRef[0]!!)
          out.putMap("gnss", gnssBlock)

          ui.post { promise.resolve(out) }
        }.start()
      },
      timeout
    )
  }

  private fun canScanBle(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ActivityCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_SCAN) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      true
    }
  }

  /**
   * 인접/등록 셀 식별자(MCC/MNC/TAC/LAC·셀 ID). Mozilla geolocate 등과 결합해 GPS와 대조 가능.
   * API·권한에 따라 비어 있을 수 있음. (READ_PHONE_STATE + 위치 권한 권장)
   */
  @SuppressLint("MissingPermission")
  private fun collectCellScan(appCtx: Context): com.facebook.react.bridge.WritableArray {
    val arr = Arguments.createArray()
    if (ActivityCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      return arr
    }
    try {
      val tm = appCtx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
      val infos = tm.allCellInfo ?: return arr
      var n = 0
      for (ci in infos) {
        if (n >= 16) break
        val row = cellInfoToMap(ci) ?: continue
        arr.pushMap(row)
        n++
      }
    } catch (_: Exception) {
    }
    return arr
  }

  private fun cellInfoToMap(ci: CellInfo): WritableMap? {
    val m = Arguments.createMap()
    m.putBoolean("registered", ci.isRegistered)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      m.putDouble("timestampMillis", ci.timestampMillis.toDouble())
    } else {
      m.putNull("timestampMillis")
    }

    when (ci) {
      is CellInfoLte -> {
        val identity = ci.cellIdentity as? CellIdentityLte ?: return null
        val mcc = readMcc(identity) ?: return null
        val mnc = readMnc(identity) ?: return null
        val tac = identity.tac
        if (tac == Int.MAX_VALUE || tac < 0) return null
        val eci = identity.ci
        if (eci == Int.MAX_VALUE || eci < 0) return null
        m.putString("radioType", "lte")
        m.putInt("mobileCountryCode", mcc)
        m.putInt("mobileNetworkCode", mnc)
        m.putInt("locationAreaCode", tac)
        m.putString("cellId", eci.toLong().toString())
        return m
      }
      is CellInfoWcdma -> {
        val identity = ci.cellIdentity as? CellIdentityWcdma ?: return null
        val mcc = readMcc(identity) ?: return null
        val mnc = readMnc(identity) ?: return null
        val lac = identity.lac
        if (lac == Int.MAX_VALUE || lac < 0) return null
        val cid = identity.cid
        if (cid == Int.MAX_VALUE || cid < 0) return null
        m.putString("radioType", "wcdma")
        m.putInt("mobileCountryCode", mcc)
        m.putInt("mobileNetworkCode", mnc)
        m.putInt("locationAreaCode", lac)
        m.putString("cellId", cid.toLong().toString())
        return m
      }
      is CellInfoGsm -> {
        val identity = ci.cellIdentity as? CellIdentityGsm ?: return null
        val mcc = readMcc(identity) ?: return null
        val mnc = readMnc(identity) ?: return null
        val lac = identity.lac
        if (lac == Int.MAX_VALUE || lac < 0) return null
        val cid = identity.cid
        if (cid == Int.MAX_VALUE || cid < 0) return null
        m.putString("radioType", "gsm")
        m.putInt("mobileCountryCode", mcc)
        m.putInt("mobileNetworkCode", mnc)
        m.putInt("locationAreaCode", lac)
        m.putString("cellId", cid.toLong().toString())
        return m
      }
      is CellInfoNr -> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val identity = ci.cellIdentity as? CellIdentityNr ?: return null
        val mcc = readMcc(identity) ?: return null
        val mnc = readMnc(identity) ?: return null
        val tac = readIntMethod(identity, "getTac") ?: return null
        if (tac == Int.MAX_VALUE || tac < 0) return null
        val nci = readLongMethod(identity, "getNci") ?: return null
        if (nci == CellInfo.UNAVAILABLE_LONG) return null
        m.putString("radioType", "nr")
        m.putInt("mobileCountryCode", mcc)
        m.putInt("mobileNetworkCode", mnc)
        m.putInt("locationAreaCode", tac)
        m.putString("cellId", nci.toString())
        return m
      }
      else -> return null
    }
  }

  private fun collectWifiScan(appCtx: Context, out: MutableList<WritableMap>) {
    try {
      val wm = appCtx.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      wm.startScan()
      val waitUntil = SystemClock.elapsedRealtime() + 1400
      while (SystemClock.elapsedRealtime() < waitUntil) {
        Thread.sleep(80)
      }
      val results = wm.scanResults ?: return
      val seen = HashSet<String>()
      for (s in results) {
        if (!seen.add(s.BSSID)) continue
        out.add(wifiScanResultToMap(s))
      }
    } catch (_: Exception) {
    }
  }

  private fun wifiScanResultToMap(s: WifiScanResult): WritableMap {
    val m = Arguments.createMap()
    m.putString("bssid", s.BSSID ?: "")
    m.putString("ssid", s.SSID ?: "")
    m.putInt("level", s.level)
    m.putInt("frequency", s.frequency)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      m.putInt("channelWidth", s.channelWidth)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      m.putInt("wifiStandard", s.wifiStandard)
    }
    return m
  }

  private fun bleResultToMap(r: BleScanResult): WritableMap {
    val m = Arguments.createMap()
    m.putString("address", r.device?.address ?: "")
    if (r.device?.name != null) {
      m.putString("name", r.device.name)
    } else {
      m.putNull("name")
    }
    m.putInt("rssi", r.rssi)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      m.putLong("timestampNanos", r.timestampNanos)
    }
    val bytes = r.scanRecord?.bytes
    if (bytes != null && bytes.isNotEmpty()) {
      val take = minOf(48, bytes.size)
      val sb = StringBuilder(take * 2)
      for (i in 0 until take) {
        sb.append(String.format("%02x", bytes[i]))
      }
      m.putString("advPayloadHexPrefix", sb.toString())
    } else {
      m.putString("advPayloadHexPrefix", "")
    }
    return m
  }

  private fun fetchFusedLocationMap(
    fusedClient: FusedLocationProviderClient,
    waitMs: Long
  ): WritableMap? {
    return try {
      val loc =
        Tasks.await(
          fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null),
          waitMs.coerceAtLeast(500),
          TimeUnit.MILLISECONDS
        )
      locationToMap(loc)
    } catch (_: Exception) {
      try {
        val last = Tasks.await(fusedClient.lastLocation, 2, TimeUnit.SECONDS)
        if (last != null) locationToMap(last) else null
      } catch (_: Exception) {
        null
      }
    }
  }

  private fun locationToMap(loc: Location?): WritableMap? {
    if (loc == null) return null
    val m = Arguments.createMap()
    m.putDouble("latitude", loc.latitude)
    m.putDouble("longitude", loc.longitude)
    if (loc.hasAltitude()) m.putDouble("altitude", loc.altitude) else m.putNull("altitude")
    if (loc.hasAccuracy()) m.putDouble("accuracy", loc.accuracy.toDouble()) else m.putNull("accuracy")
    if (loc.hasBearing()) m.putDouble("bearing", loc.bearing.toDouble()) else m.putNull("bearing")
    if (loc.hasSpeed()) m.putDouble("speed", loc.speed.toDouble()) else m.putNull("speed")
    m.putString("provider", loc.provider ?: "unknown")
    m.putDouble("time", loc.time.toDouble())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
      m.putDouble("elapsedRealtimeNanos", loc.elapsedRealtimeNanos.toDouble())
    } else {
      m.putNull("elapsedRealtimeNanos")
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      if (loc.hasSpeedAccuracy()) m.putDouble("speedAccuracyMps", loc.speedAccuracyMetersPerSecond.toDouble())
      else m.putNull("speedAccuracyMps")
      if (loc.hasBearingAccuracy()) m.putDouble("bearingAccuracyDeg", loc.bearingAccuracyDegrees.toDouble())
      else m.putNull("bearingAccuracyDeg")
      if (loc.hasVerticalAccuracy()) m.putDouble("verticalAccuracyM", loc.verticalAccuracyMeters.toDouble())
      else m.putNull("verticalAccuracyM")
    }
    return m
  }

  private fun gnssClockToMap(clock: android.location.GnssClock): WritableMap {
    val w = Arguments.createMap()
    w.putDouble("timeNanos", clock.timeNanos.toDouble())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      if (clock.hasTimeUncertaintyNanos()) w.putDouble("timeUncertaintyNanos", clock.timeUncertaintyNanos)
      else w.putNull("timeUncertaintyNanos")
      if (clock.hasLeapSecond()) w.putInt("leapSecond", clock.leapSecond) else w.putNull("leapSecond")
      if (clock.hasFullBiasNanos()) w.putDouble("fullBiasNanos", clock.fullBiasNanos.toDouble())
      else w.putNull("fullBiasNanos")
      if (clock.hasBiasNanos()) w.putDouble("biasNanos", clock.biasNanos) else w.putNull("biasNanos")
      if (clock.hasBiasUncertaintyNanos()) w.putDouble("biasUncertaintyNanos", clock.biasUncertaintyNanos)
      else w.putNull("biasUncertaintyNanos")
      if (clock.hasDriftNanosPerSecond()) w.putDouble("driftNanosPerSecond", clock.driftNanosPerSecond)
      else w.putNull("driftNanosPerSecond")
      if (clock.hasDriftUncertaintyNanosPerSecond()) {
        w.putDouble("driftUncertaintyNanosPerSecond", clock.driftUncertaintyNanosPerSecond)
      } else {
        w.putNull("driftUncertaintyNanosPerSecond")
      }
      w.putInt("hardwareClockDiscontinuityCount", clock.hardwareClockDiscontinuityCount)
    }
    return w
  }

  @SuppressLint("NewApi")
  private fun gnssMeasurementToMap(m: GnssMeasurement): WritableMap {
    val w = Arguments.createMap()
    w.putInt("svid", m.svid)
    w.putInt("constellationType", m.constellationType)
    w.putDouble("timeOffsetNanos", m.timeOffsetNanos.toDouble())
    w.putInt("state", m.state)
    w.putDouble("receivedSvTimeNanos", m.receivedSvTimeNanos.toDouble())
    w.putDouble("cn0DbHz", m.cn0DbHz.toDouble())
    w.putDouble("pseudorangeRateMetersPerSecond", m.pseudorangeRateMetersPerSecond.toDouble())

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      putNullableDouble(
        w,
        "receivedSvTimeUncertaintyNanos",
        readDoubleMethod(m, "getReceivedSvTimeUncertaintyNanos")
      )
      putNullableDouble(
        w,
        "pseudorangeRateUncertaintyMetersPerSecond",
        readDoubleMethod(m, "getPseudorangeRateUncertaintyMetersPerSecond")
      )
      putNullableInt(
        w,
        "accumulatedDeltaRangeState",
        readIntMethod(m, "getAccumulatedDeltaRangeState")
      )
      putNullableDouble(
        w,
        "accumulatedDeltaRangeMeters",
        readDoubleMethod(m, "getAccumulatedDeltaRangeMeters")
      )
      putNullableDouble(
        w,
        "accumulatedDeltaRangeUncertaintyMeters",
        readDoubleMethod(m, "getAccumulatedDeltaRangeUncertaintyMeters")
      )
      if (m.hasCarrierFrequencyHz()) w.putDouble("carrierFrequencyHz", m.carrierFrequencyHz.toDouble())
      else w.putNull("carrierFrequencyHz")
      if (m.hasCarrierCycles()) w.putDouble("carrierCycles", m.carrierCycles.toDouble()) else w.putNull("carrierCycles")
      if (m.hasCarrierPhase()) w.putDouble("carrierPhase", m.carrierPhase) else w.putNull("carrierPhase")
      if (m.hasCarrierPhaseUncertainty()) w.putDouble("carrierPhaseUncertainty", m.carrierPhaseUncertainty)
      else w.putNull("carrierPhaseUncertainty")
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        w.putInt("multipathIndicator", m.multipathIndicator)
      } else {
        w.putNull("multipathIndicator")
      }
      if (m.hasSnrInDb()) w.putDouble("snrInDb", m.snrInDb.toDouble()) else w.putNull("snrInDb")
    } else {
      w.putNull("receivedSvTimeUncertaintyNanos")
      w.putNull("pseudorangeRateUncertaintyMetersPerSecond")
      w.putNull("accumulatedDeltaRangeState")
      w.putNull("accumulatedDeltaRangeMeters")
      w.putNull("accumulatedDeltaRangeUncertaintyMeters")
      w.putNull("carrierFrequencyHz")
      w.putNull("carrierCycles")
      w.putNull("carrierPhase")
      w.putNull("carrierPhaseUncertainty")
      w.putNull("multipathIndicator")
      w.putNull("snrInDb")
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (m.hasFullInterSignalBiasNanos()) w.putDouble("fullInterSignalBiasNanos", m.fullInterSignalBiasNanos)
      else w.putNull("fullInterSignalBiasNanos")
    }

    return w
  }

  private fun readMcc(identity: Any): Int? {
    return readPlmnPart(identity, "getMccString", "getMcc")
  }

  private fun readMnc(identity: Any): Int? {
    return readPlmnPart(identity, "getMncString", "getMnc")
  }

  private fun readPlmnPart(identity: Any, stringGetter: String, intGetter: String): Int? {
    val fromString = readStringMethod(identity, stringGetter)?.toIntOrNull()
    if (fromString != null && fromString >= 0) return fromString
    val fromInt = readIntMethod(identity, intGetter)
    if (fromInt == null || fromInt < 0 || fromInt == Int.MAX_VALUE) return null
    return fromInt
  }

  private fun readStringMethod(target: Any, name: String): String? {
    return try {
      val value = target.javaClass.getMethod(name).invoke(target)
      value as? String
    } catch (_: Exception) {
      null
    }
  }

  private fun readIntMethod(target: Any, name: String): Int? {
    return try {
      val value = target.javaClass.getMethod(name).invoke(target)
      (value as? Number)?.toInt()
    } catch (_: Exception) {
      null
    }
  }

  private fun readLongMethod(target: Any, name: String): Long? {
    return try {
      val value = target.javaClass.getMethod(name).invoke(target)
      (value as? Number)?.toLong()
    } catch (_: Exception) {
      null
    }
  }

  private fun readDoubleMethod(target: Any, name: String): Double? {
    return try {
      val value = target.javaClass.getMethod(name).invoke(target)
      (value as? Number)?.toDouble()
    } catch (_: Exception) {
      null
    }
  }

  private fun putNullableInt(map: WritableMap, key: String, value: Int?) {
    if (value == null) map.putNull(key) else map.putInt(key, value)
  }

  private fun putNullableDouble(map: WritableMap, key: String, value: Double?) {
    if (value == null) map.putNull(key) else map.putDouble(key, value)
  }
}
