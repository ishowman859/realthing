package com.verity.app.network

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.cert.Certificate
import javax.net.ssl.HttpsURLConnection

class VerityPinnedHttpModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private val PINNED_CERT_SHA256 = mapOf(
      "api.veritychains.com" to setOf(
        "2fe51654ffc9674f8d8e8c6be711bce1b59d4203c8806e338d2fb1a7ea414237"
      )
    )
  }

  override fun getName(): String = "VerityPinnedHttp"

  @ReactMethod
  fun request(
    method: String,
    url: String,
    headers: ReadableMap?,
    body: String?,
    promise: Promise
  ) {
    Thread {
      try {
        val response = executeRequest(method, url, headers, body)
        promise.resolve(response)
      } catch (error: Throwable) {
        promise.reject("ERR_PINNED_HTTP", error.message, error)
      }
    }.start()
  }

  private fun executeRequest(
    method: String,
    urlString: String,
    headers: ReadableMap?,
    body: String?
  ) = Arguments.createMap().apply {
    val url = URL(urlString)
    val connection = (url.openConnection() as HttpURLConnection).apply {
      requestMethod = method.uppercase()
      connectTimeout = 15000
      readTimeout = 20000
      instanceFollowRedirects = false
      doInput = true
      headers?.entryIterator?.forEach { entry ->
        setRequestProperty(entry.key, entry.value?.toString() ?: "")
      }
    }

    try {
      if (!body.isNullOrEmpty() && method.uppercase() != "GET") {
        connection.doOutput = true
        val bytes = body.toByteArray(StandardCharsets.UTF_8)
        if (connection.getRequestProperty("Content-Type").isNullOrBlank()) {
          connection.setRequestProperty("Content-Type", "application/json")
        }
        connection.setRequestProperty("Content-Length", bytes.size.toString())
        connection.outputStream.use { output ->
          output.write(bytes)
        }
      }

      if (connection is HttpsURLConnection) {
        connection.connect()
        validatePinnedCertificate(connection, url.host)
      }

      val status = connection.responseCode
      val responseBody = readText(
        connection.errorStream ?: connection.inputStream
      )
      val responseHeaders = Arguments.createMap()
      for ((key, values) in connection.headerFields) {
        if (key == null || values.isNullOrEmpty()) continue
        responseHeaders.putString(key, values.joinToString(", "))
      }

      putInt("status", status)
      putBoolean("ok", status in 200..299)
      putString("body", responseBody)
      putMap("headers", responseHeaders)
    } finally {
      connection.disconnect()
    }
  }

  private fun validatePinnedCertificate(connection: HttpsURLConnection, host: String) {
    val allowedPins = PINNED_CERT_SHA256[host.lowercase()] ?: return
    val certs = connection.serverCertificates ?: emptyArray<Certificate>()
    if (certs.isEmpty()) {
      throw IllegalStateException("No server certificate received for $host")
    }
    val leafFingerprint = sha256Hex(certs[0].encoded)
    if (!allowedPins.contains(leafFingerprint)) {
      throw IllegalStateException("SSL pin mismatch for $host")
    }
  }

  private fun sha256Hex(bytes: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun readText(stream: InputStream?): String {
    if (stream == null) return ""
    return BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
      buildString {
        var line = reader.readLine()
        var first = true
        while (line != null) {
          if (!first) append('\n')
          append(line)
          first = false
          line = reader.readLine()
        }
      }
    }
  }
}
