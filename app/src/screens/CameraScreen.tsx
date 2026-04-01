import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
  InteractionManager,
  Platform,
  StatusBar,
  PermissionsAndroid,
} from "react-native";
import { CameraView, CameraMode, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { RegistrationStatus } from "../hooks/useVerityHash";
import { HashMode } from "../utils/verityApi";
import {
  standardizePhotoForHashing,
  StandardizedPhotoMeta,
} from "../utils/standardizePhoto";
import {
  getRadioEnvironmentSnapshot,
  RadioEnvironmentSnapshot,
} from "../native/VerityRadioEnvironment";
import { ui } from "../theme/tokens";

const barShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      }
    : { elevation: 1 };

type CaptureMediaType = "photo" | "video";
interface CaptureContext {
  captureTimestamp: number;
  gps: { lat: number; lng: number } | null;
  standardizedPhoto: StandardizedPhotoMeta | null;
  gpsSource: string | null;
  radioEnvironment: RadioEnvironmentSnapshot | null;
}

interface CameraScreenProps {
  status: RegistrationStatus;
  statusMessageOverride?: string | null;
  currentPhash: string | null;
  currentSha256: string | null;
  txSignature: string | null;
  verificationUrl: string | null;
  qrCodeUrl: string | null;
  hashMode: HashMode | null;
  error: string | null;
  onRegisterPhoto: (
    uri: string,
    mode: HashMode,
    aiRiskScore?: number,
    metadata?: Record<string, unknown>,
    opts?: { mediaType?: CaptureMediaType }
  ) => Promise<any>;
  onReset: () => void;
  onBack: () => void;
}

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  idle: "",
  computing_hash: "Computing pHash and SHA-256...",
  building_tx: "Preparing registration...",
  awaiting_signature: "Preparing upload...",
  confirming: "Submitting to the server...",
  success: "Registered. Waiting for batch anchoring...",
  error: "Something went wrong",
};

type LibrarySaveState = "idle" | "ready" | "saving" | "saved" | "error";

export default function CameraScreen({
  status,
  statusMessageOverride,
  currentPhash,
  currentSha256,
  txSignature,
  verificationUrl,
  qrCodeUrl,
  hashMode,
  error,
  onRegisterPhoto,
  onReset,
  onBack,
}: CameraScreenProps) {
  const cameraRef = useRef<CameraView>(null);
  const lastRegisterAtRef = useRef(0);
  const lastAutoRegisterKeyRef = useRef<string | null>(null);
  /** Save each captured file to the library only once per hash combination. */
  const lastLibrarySaveKeyRef = useRef<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedMediaType, setCapturedMediaType] =
    useState<CaptureMediaType>("photo");
  const [captureContext, setCaptureContext] = useState<CaptureContext | null>(null);
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [cameraMode, setCameraMode] = useState<CameraMode>("picture");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaLibraryGranted, setMediaLibraryGranted] = useState<boolean | null>(null);
  const [isRequestingLibraryPermission, setIsRequestingLibraryPermission] =
    useState(false);
  const [librarySaveState, setLibrarySaveState] = useState<LibrarySaveState>("idle");
  const [librarySaveMessage, setLibrarySaveMessage] = useState<string | null>(null);

  const requestMediaLibraryPermission = async () => {
    try {
      setIsRequestingLibraryPermission(true);
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      const granted = permission.status === "granted";
      setMediaLibraryGranted(granted);
      if (!granted) {
        Alert.alert(
          "Media library",
          "Allow photo/video library access to save the registered media to your device."
        );
      }
      return granted;
    } finally {
      setIsRequestingLibraryPermission(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!capturedUri) {
      setMediaLibraryGranted(null);
      setLibrarySaveState("idle");
      setLibrarySaveMessage(null);
      return;
    }
    (async () => {
      try {
        const current = await MediaLibrary.getPermissionsAsync(true);
        if (cancelled) return;
        if (current.status === "granted") {
          setMediaLibraryGranted(true);
          setLibrarySaveState("ready");
          return;
        }
        setMediaLibraryGranted(false);
        setLibrarySaveState("idle");
      } catch {
        if (!cancelled) {
          setMediaLibraryGranted(false);
          setLibrarySaveState("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [capturedUri]);

  const saveCurrentMediaToLibrary = async (requestIfNeeded = false) => {
    if (!capturedUri || status !== "success") return;
    const sha = currentSha256?.trim();
    const ph = currentPhash?.trim();
    const dedupeKey = `${capturedUri}|${sha ?? ""}|${ph ?? ""}|${capturedMediaType}`;
    if (lastLibrarySaveKeyRef.current === dedupeKey || librarySaveState === "saving") {
      return;
    }

    setLibrarySaveState("saving");
      setLibrarySaveMessage(
        capturedMediaType === "video"
          ? "Saving the registered source video to your Verity album..."
          : "Saving the standardized JPG to your Verity album..."
      );

    try {
      let granted = mediaLibraryGranted === true;
      if (!granted && requestIfNeeded) {
        granted = await requestMediaLibraryPermission();
      }
      if (!granted) {
        setLibrarySaveState("idle");
        setLibrarySaveMessage(
          "Allow media-library access to save the registered file to your device."
        );
        return;
      }

      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      await saveCapturedMediaToLibrary(capturedUri, capturedMediaType);
      lastLibrarySaveKeyRef.current = dedupeKey;
      setLibrarySaveState("saved");
      setLibrarySaveMessage(
        capturedMediaType === "video"
          ? "The source video was saved to your Verity album. Use this file again for verification."
          : "The standardized JPG was saved to your Verity album. Use this JPG again for verification."
      );
    } catch (e) {
      console.warn("saveToLibraryAsync", e);
      setLibrarySaveState("error");
      setLibrarySaveMessage(
        capturedMediaType === "video"
          ? "We could not save the video. Please try again."
          : "We could not save the photo. Please try again."
      );
    }
  };

  useEffect(() => {
    if (status !== "success" || !capturedUri || mediaLibraryGranted !== true) return;
    if (librarySaveState === "saved" || librarySaveState === "saving") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      void saveCurrentMediaToLibrary(false);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, capturedUri, mediaLibraryGranted, librarySaveState]);

  useEffect(() => {
    if (!capturedUri || capturedMediaType !== "photo") return;
    if (status !== "idle") return;
    if (!captureContext) return;

    const autoKey = [
      capturedUri,
      capturedMediaType,
      captureContext.captureTimestamp,
    ].join("|");
    if (lastAutoRegisterKeyRef.current === autoKey) return;
    lastAutoRegisterKeyRef.current = autoKey;

    void handleRegister("sha256", { autoProceedWarn: true });
  }, [
    capturedUri,
    capturedMediaType,
    status,
    captureContext,
  ]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ui.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={ui.canvas} />
        <View style={styles.centered}>
          <View style={styles.permissionIconWrap}>
            <Ionicons name="camera-outline" size={40} color={ui.primary} />
          </View>
          <Text style={styles.permissionText}>
            Camera access is required
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
            activeOpacity={0.88}
          >
            <Text style={styles.permissionButtonText}>Allow access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: true,
      });

      if (photo?.uri) {
        const standardizedPhoto = await standardizePhotoForHashing({
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
        });
        const captureTimestamp = Date.now();
        const exifGps = extractGpsFromExif(photo.exif);
        setCapturedUri(standardizedPhoto.uri);
        setCaptureContext({
          captureTimestamp,
          gps: exifGps,
          standardizedPhoto: standardizedPhoto.meta,
          gpsSource: exifGps ? "Photo EXIF GPS" : null,
          radioEnvironment: null,
        });
        let radioEnvironment: RadioEnvironmentSnapshot | null = null;
        try {
          const snapshot = await collectRadioEnvironmentSnapshotSafe();
          radioEnvironment = snapshot;
          const fusedGps = extractGpsFromRadioEnvironment(snapshot);
          setCaptureContext({
            captureTimestamp,
            gps: exifGps ?? fusedGps,
            standardizedPhoto: standardizedPhoto.meta,
            gpsSource: exifGps
              ? "Photo EXIF GPS"
              : fusedGps
                ? "Android fused location"
                : null,
            radioEnvironment: snapshot,
          });
        } catch {
          setCaptureContext({
            captureTimestamp,
            gps: exifGps ?? extractGpsFromRadioEnvironment(radioEnvironment),
            standardizedPhoto: standardizedPhoto.meta,
            gpsSource: exifGps
              ? "Photo EXIF GPS"
              : extractGpsFromRadioEnvironment(radioEnvironment)
                ? "Android fused location"
                : null,
            radioEnvironment,
          });
        }
      }
    } catch (err) {
      Alert.alert("Error", "Photo capture failed.");
    }
  };

  const toggleCaptureMediaType = (nextType: CaptureMediaType) => {
    if (isRecording) return;
    setCameraMode(nextType === "video" ? "video" : "picture");
    setCapturedMediaType(nextType);
  };

  const startVideoRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    try {
      setIsRecording(true);
      const recorded = await cameraRef.current.recordAsync({
        maxDuration: 120,
      });
      if (recorded?.uri) {
        setCapturedUri(recorded.uri);
        setCapturedMediaType("video");
        setCaptureContext({
          captureTimestamp: Date.now(),
          gps: null,
          standardizedPhoto: null,
          gpsSource: null,
          radioEnvironment: null,
        });
      }
    } catch (err) {
      Alert.alert("Error", "Video recording failed.");
    } finally {
      setIsRecording(false);
    }
  };

  const stopVideoRecording = async () => {
    if (!cameraRef.current || !isRecording) return;
    try {
      cameraRef.current.stopRecording();
    } catch (err) {
      Alert.alert("Error", "Could not stop video recording.");
      setIsRecording(false);
    }
  };

  const handleRegister = async (
    mode: HashMode,
    options?: { autoProceedWarn?: boolean }
  ) => {
    if (!capturedUri) return;
    if (capturedMediaType === "video" && mode === "phash") {
      Alert.alert("Info", "Videos are registered with SHA-256 plus representative pHash keyframes.");
      return;
    }

    const now = Date.now();
    const elapsedMs = now - lastRegisterAtRef.current;
    if (elapsedMs < 1000) {
      Alert.alert("Please wait", "Media registration is limited to once per second.");
      return;
    }

    lastRegisterAtRef.current = Date.now();
    await onRegisterPhoto(capturedUri, mode, undefined, {
      captureMediaType: capturedMediaType,
      captureTimestamp: captureContext?.captureTimestamp ?? Date.now(),
      gps: captureContext?.gps ?? null,
      gpsSource: captureContext?.gpsSource ?? null,
      androidRadioRawSnapshot: captureContext?.radioEnvironment ?? null,
      gnssDerivedLocation: toGnssDerivedLocation(
        captureContext?.radioEnvironment ?? null
      ),
      radioEvidenceSummary: summarizeRadioEnvironment(
        captureContext?.radioEnvironment ?? null
      ),
      standardizedPhoto: captureContext?.standardizedPhoto ?? null,
    }, { mediaType: capturedMediaType });
  };

  const handleRetake = () => {
    lastLibrarySaveKeyRef.current = null;
    lastAutoRegisterKeyRef.current = null;
    setCapturedUri(null);
    setCaptureContext(null);
    setCapturedMediaType(cameraMode === "video" ? "video" : "photo");
    setLibrarySaveState("idle");
    setLibrarySaveMessage(null);
    onReset();
  };

  const isProcessing =
    status === "computing_hash" ||
    status === "building_tx" ||
    status === "awaiting_signature" ||
    status === "confirming";

  const handleShare = async () => {
    if (!verificationUrl) return;
    await Linking.openURL(verificationUrl);
  };

  const handleShareQr = async () => {
    if (!qrCodeUrl) return;
    await Linking.openURL(qrCodeUrl);
  };

  const isPhotoCapture = capturedMediaType === "photo";

  // Result / registration screen after capture
  if (capturedUri) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={ui.surface} />
        <View style={[styles.topBar, barShadow]}>
          <TouchableOpacity onPress={onBack} disabled={isProcessing}>
            <Ionicons name="arrow-back" size={24} color={ui.text} />
          </TouchableOpacity>
        <Text style={styles.topBarTitle}>Register</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.previewContainer}
          bounces={false}
        >
          {isPhotoCapture ? (
            <Image source={{ uri: capturedUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.videoPreviewCard}>
              <Ionicons name="videocam" size={36} color={ui.primary} />
              <Text style={styles.videoPreviewTitle}>Video captured</Text>
              <Text style={styles.videoPreviewDesc}>
                This video will be registered with SHA-256 and representative pHash keyframes.
              </Text>
              <Text style={styles.videoPreviewUri} numberOfLines={2}>
                {capturedUri}
              </Text>
              <View style={styles.videoPill}>
                <Text style={styles.videoPillText}>VIDEO</Text>
              </View>
            </View>
          )}

          {status === "idle" && isPhotoCapture && (
            <View style={styles.libraryCard}>
              <Text style={styles.libraryCardTitle}>Auto registration</Text>
              <Text style={styles.libraryCardDesc}>
                Photos are standardized to JPG and registered automatically right after capture.
              </Text>
            </View>
          )}

          {/* 상태 표시 */}
          {status !== "idle" && (
            <View style={styles.statusContainer}>
              {isProcessing && (
                <ActivityIndicator
                  size="small"
                  color={ui.primary}
                  style={{ marginBottom: 8 }}
                />
              )}
              {status === "success" && (
                <Ionicons
                  name="checkmark-circle"
                  size={32}
                  color={ui.success}
                  style={{ marginBottom: 8 }}
                />
              )}
              {status === "error" && (
                <Ionicons
                  name="close-circle"
                  size={32}
                  color={ui.danger}
                  style={{ marginBottom: 8 }}
                />
              )}

              <Text style={styles.statusText}>
                {statusMessageOverride || STATUS_LABELS[status]}
              </Text>
              {hashMode && (
                <Text style={styles.modeMetaText}>
                  Mode: {hashMode === "sha256" ? "SHA-256" : "pHash"}
                </Text>
              )}
              {status === "success" && (currentSha256 || currentPhash) ? (
                <Text style={styles.saveHintText}>
                  {capturedMediaType === "video"
                    ? "The registered source video can be saved to your Verity album. Hash values are not embedded into the file."
                    : "The registered standardized JPG can be saved to your Verity album. Hash values are not embedded into the file."}
                </Text>
              ) : null}

              {currentPhash && (
                <View style={styles.hashContainer}>
                  <Text style={styles.hashLabel}>pHash</Text>
                  <Text style={styles.hashValue}>{currentPhash}</Text>
                </View>
              )}

              {currentSha256 && (
                <View style={styles.hashContainer}>
                  <Text style={styles.hashLabel}>SHA-256</Text>
                  <Text style={styles.hashValue} numberOfLines={2}>
                    {currentSha256}
                  </Text>
                </View>
              )}

              {txSignature && (
                <View style={styles.hashContainer}>
                  <Text style={styles.hashLabel}>TX Signature</Text>
                  <Text style={styles.hashValue} numberOfLines={1}>
                    {txSignature.slice(0, 32)}...
                  </Text>
                </View>
              )}

              {verificationUrl && (
                <View style={styles.hashContainer}>
                  <Text style={styles.hashLabel}>Verification URL</Text>
                  <Text style={styles.hashValue} numberOfLines={1}>
                    {verificationUrl}
                  </Text>
                  <Text style={styles.anchorHintText}>
                    The server batches SHA-256 and pHash Merkle trees roughly every 10 seconds and anchors the roots on Solana.
                    You can confirm the tree state on the verification page shortly after.
                  </Text>
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => Linking.openURL(verificationUrl)}
                  >
                    <Text style={styles.linkButtonText}>Open verification page</Text>
                  </TouchableOpacity>
                </View>
              )}

              {qrCodeUrl && (
                <View style={styles.hashContainer}>
                  <Text style={styles.hashLabel}>QR code</Text>
                  <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} />
                  <TouchableOpacity style={styles.linkButton} onPress={handleShareQr}>
                    <Text style={styles.linkButtonText}>Share QR image</Text>
                  </TouchableOpacity>
                </View>
              )}

              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>
          )}

          {capturedUri ? (
            <View
              style={[
                styles.libraryCard,
                mediaLibraryGranted === true
                  ? styles.libraryCardGranted
                  : styles.libraryCardPending,
              ]}
            >
              <Text style={styles.libraryCardTitle}>Save to device</Text>
              <Text style={styles.libraryCardDesc}>
                {librarySaveMessage
                  ? librarySaveMessage
                  : mediaLibraryGranted === true
                    ? "Once registration completes, the file can be saved to the Verity album on your device."
                    : "Allow photo/video library access to save the registered file."}
              </Text>
              {status === "success" ? (
                <TouchableOpacity
                  style={styles.libraryPermissionButton}
                  onPress={() => {
                    void saveCurrentMediaToLibrary(true);
                  }}
                  disabled={
                    isRequestingLibraryPermission || librarySaveState === "saving"
                  }
                >
                  <Text style={styles.libraryPermissionButtonText}>
                    {isRequestingLibraryPermission
                      ? "Requesting access..."
                      : librarySaveState === "saving"
                        ? "Saving..."
                        : librarySaveState === "saved"
                          ? "Saved"
                          : mediaLibraryGranted === true
                            ? "Save to device"
                            : "Allow access and save"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* 버튼 영역 */}
          <View style={styles.previewButtons}>
            {status === "idle" && (
              <>
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={handleRetake}
                >
                  <Ionicons name="refresh" size={20} color={ui.textSecondary} />
                  <Text style={styles.retakeText}>Retake</Text>
                </TouchableOpacity>
                {!isPhotoCapture ? (
                  <>
                    <TouchableOpacity
                      style={styles.registerButton}
                      onPress={() => handleRegister("sha256")}
                    >
                      <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
                      <Text style={styles.registerText}>Submit SHA-256 + pHash</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.registerButtonSecondary}
                      onPress={() => handleRegister("phash")}
                    >
                      <Ionicons name="images" size={20} color={ui.primary} />
                      <Text style={styles.registerTextSecondary}>Submit pHash only</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </>
            )}

            {status === "success" && (
              <>
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={handleRetake}
                >
                  <Ionicons
                    name={capturedMediaType === "video" ? "videocam" : "camera"}
                    size={20}
                    color={ui.textSecondary}
                  />
                  <Text style={styles.retakeText}>
                    {capturedMediaType === "video" ? "Record another video" : "Take another photo"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.doneButton} onPress={onBack}>
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>

                {!!verificationUrl && (
                  <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
                    <Ionicons name="open-outline" size={18} color={ui.primary} />
                    <Text style={styles.shareButtonText}>Open verification link</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {status === "error" && (
              <>
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={handleRetake}
                >
                  <Ionicons name="refresh" size={20} color={ui.textSecondary} />
                  <Text style={styles.retakeText}>Try again</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 카메라 뷰
  return (
    <SafeAreaView style={styles.cameraChrome}>
      <StatusBar barStyle="dark-content" backgroundColor={ui.surface} />
      <View style={[styles.topBar, barShadow]}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Capture</Text>
        <TouchableOpacity
          onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="camera-reverse" size={24} color={ui.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.captureTypeBar}>
        <TouchableOpacity
          style={[
            styles.captureTypeChip,
            cameraMode === "picture" && styles.captureTypeChipActive,
          ]}
          onPress={() => toggleCaptureMediaType("photo")}
        >
          <Text
            style={[
              styles.captureTypeChipText,
              cameraMode === "picture" && styles.captureTypeChipTextActive,
            ]}
          >
            Photo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.captureTypeChip,
            cameraMode === "video" && styles.captureTypeChipActive,
          ]}
          onPress={() => toggleCaptureMediaType("video")}
        >
          <Text
            style={[
              styles.captureTypeChipText,
              cameraMode === "video" && styles.captureTypeChipTextActive,
            ]}
          >
            Video
          </Text>
        </TouchableOpacity>
      </View>

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode={cameraMode}
        mute
        videoQuality="720p"
      >
        <View style={styles.cameraOverlay}>
          <View style={styles.crosshair}>
            <View style={[styles.crosshairCorner, styles.topLeft]} />
            <View style={[styles.crosshairCorner, styles.topRight]} />
            <View style={[styles.crosshairCorner, styles.bottomLeft]} />
            <View style={[styles.crosshairCorner, styles.bottomRight]} />
          </View>
        </View>
      </CameraView>

      <View style={styles.cameraControls}>
        <View style={styles.captureControlSpacer} />
        <TouchableOpacity
          style={[
            styles.captureButton,
            cameraMode === "video" && styles.captureButtonVideo,
            isRecording && styles.captureButtonRecording,
          ]}
          onPress={
            cameraMode === "video"
              ? isRecording
                ? stopVideoRecording
                : startVideoRecording
              : takePicture
          }
        >
          <View
            style={[
              styles.captureButtonInner,
              cameraMode === "video" && styles.captureButtonInnerVideo,
              isRecording && styles.captureButtonInnerRecording,
            ]}
          />
        </TouchableOpacity>
        <View style={styles.captureModeLabelWrap}>
          <Text style={styles.captureModeLabel}>
            {cameraMode === "video"
              ? isRecording
                ? "Recording"
                : "Video"
              : "Photo"}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ui.canvas,
  },
  cameraChrome: {
    flex: 1,
    backgroundColor: ui.surface,
  },
  centered: {
    flex: 1,
    backgroundColor: ui.canvas,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 32,
  },
  permissionIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: ui.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: ui.surface,
    borderBottomWidth: 1,
    borderBottomColor: ui.borderLight,
  },
  topBarTitle: {
    color: ui.text,
    fontSize: 17,
    fontWeight: "700",
  },
  permissionText: {
    color: ui.textSecondary,
    fontSize: 17,
    textAlign: "center",
    fontWeight: "600",
  },
  permissionButton: {
    backgroundColor: ui.primary,
    paddingHorizontal: 28,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 4,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  camera: {
    flex: 1,
    backgroundColor: "#000",
  },
  captureTypeBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: ui.surface,
  },
  captureTypeChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: ui.canvas,
    borderWidth: 1,
    borderColor: ui.border,
  },
  captureTypeChipActive: {
    backgroundColor: ui.primarySoft,
    borderColor: ui.primary,
  },
  captureTypeChipText: {
    color: ui.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  captureTypeChipTextActive: {
    color: ui.primary,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  crosshair: {
    width: 240,
    height: 240,
    position: "relative",
  },
  crosshairCorner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#FFFFFF",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  cameraControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 36,
    backgroundColor: ui.surface,
    borderTopWidth: 1,
    borderTopColor: ui.borderLight,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "transparent",
    borderWidth: 4,
    borderColor: ui.text,
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonVideo: {
    borderColor: ui.danger,
  },
  captureButtonRecording: {
    borderColor: ui.danger,
    transform: [{ scale: 1.03 }],
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: ui.primary,
  },
  captureButtonInnerVideo: {
    backgroundColor: ui.danger,
  },
  captureButtonInnerRecording: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: ui.danger,
  },
  captureModeLabelWrap: {
    width: 48,
    alignItems: "center",
  },
  captureModeLabel: {
    color: ui.textSecondary,
    fontSize: 11,
    fontWeight: "800",
  },
  previewContainer: {
    padding: 20,
    paddingBottom: 36,
    alignItems: "center",
    backgroundColor: ui.canvas,
  },
  previewImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    marginBottom: 20,
  },
  statusContainer: {
    backgroundColor: ui.surface,
    borderRadius: 18,
    padding: 20,
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: ui.borderLight,
  },
  statusText: {
    color: ui.text,
    fontSize: 17,
    fontWeight: "700",
  },
  modeMetaText: {
    color: ui.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  saveHintText: {
    color: ui.textSecondary,
    fontSize: 12,
    marginTop: 10,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  hashContainer: {
    marginTop: 12,
    backgroundColor: ui.canvas,
    borderRadius: 12,
    padding: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: ui.borderLight,
  },
  hashLabel: {
    color: ui.primary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  hashValue: {
    color: ui.text,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  errorText: {
    color: ui.danger,
    fontSize: 14,
    marginTop: 8,
    fontWeight: "600",
  },
  libraryCard: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  libraryCardPending: {
    backgroundColor: ui.warningSoft,
    borderColor: ui.warning,
  },
  libraryCardGranted: {
    backgroundColor: ui.successSoft,
    borderColor: ui.success,
  },
  libraryCardTitle: {
    color: ui.text,
    fontSize: 15,
    fontWeight: "800",
  },
  libraryCardDesc: {
    color: ui.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  libraryPermissionButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: ui.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  libraryPermissionButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  previewButtons: {
    width: "100%",
    gap: 12,
  },
  retakeButton: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: ui.surface,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ui.border,
  },
  retakeText: {
    color: ui.text,
    fontSize: 16,
    fontWeight: "700",
  },
  registerButton: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: ui.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  registerText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  registerButtonSecondary: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: ui.surface,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: ui.primarySoft,
  },
  registerTextSecondary: {
    color: ui.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  doneButton: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: ui.text,
    paddingVertical: 16,
    borderRadius: 14,
  },
  doneText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  shareButton: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: ui.primarySoft,
    paddingVertical: 16,
    borderRadius: 14,
  },
  shareButtonText: {
    color: ui.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  linkButton: {
    marginTop: 10,
    backgroundColor: ui.primarySoft,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  linkButtonText: {
    color: ui.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  anchorHintText: {
    color: ui.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  qrImage: {
    width: 160,
    height: 160,
    marginTop: 8,
    alignSelf: "center",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  captureControlSpacer: {
    width: 86,
  },
  videoPreviewCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ui.borderLight,
    backgroundColor: ui.surface,
    padding: 22,
    alignItems: "center",
    marginBottom: 18,
  },
  videoPreviewTitle: {
    color: ui.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  videoPreviewDesc: {
    color: ui.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  videoPreviewUri: {
    color: ui.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 12,
  },
  videoPill: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: ui.primarySoft,
  },
  videoPillText: {
    color: ui.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});

function extractGpsFromExif(exif: any): { lat: number; lng: number } | null {
  if (!exif || typeof exif !== "object") return null;
  const lat = Number(exif.GPSLatitude ?? exif.latitude ?? exif.Latitude);
  const lng = Number(exif.GPSLongitude ?? exif.longitude ?? exif.Longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

async function collectRadioEnvironmentSnapshotSafe(): Promise<RadioEnvironmentSnapshot | null> {
  if (Platform.OS !== "android") return null;
  const granted = await requestRadioEnvironmentPermissions();
  if (!granted) return null;
  try {
    return await getRadioEnvironmentSnapshot(2500);
  } catch (error) {
    console.warn("radioEnvironmentSnapshot", error);
    return null;
  }
}

async function requestRadioEnvironmentPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const needs = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  if (PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION) {
    needs.push(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  }
  if (PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE) {
    needs.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
  }
  if (Platform.Version >= 31) {
    if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN) {
      needs.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    }
    if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
      needs.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    }
  }
  const result = (await PermissionsAndroid.requestMultiple(
    needs as any
  )) as Record<string, string>;
  return needs.every(
    (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED
  );
}

function extractGpsFromRadioEnvironment(
  snapshot: RadioEnvironmentSnapshot | null | undefined
): { lat: number; lng: number } | null {
  const fused = snapshot?.gnss?.fusedLocation;
  const lat = Number(fused?.latitude);
  const lng = Number(fused?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toGnssDerivedLocation(
  snapshot: RadioEnvironmentSnapshot | null | undefined
): Record<string, unknown> | null {
  const fused = snapshot?.gnss?.fusedLocation;
  const lat = Number(fused?.latitude);
  const lng = Number(fused?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng,
    accuracy: fused?.accuracy ?? null,
    provider: fused?.provider ?? "android_fused_location",
  };
}

function summarizeRadioEnvironment(
  snapshot: RadioEnvironmentSnapshot | null | undefined
): string | null {
  if (!snapshot) return null;
  const wifiCount = Array.isArray(snapshot.wifiScan) ? snapshot.wifiScan.length : 0;
  const cellCount = Array.isArray(snapshot.cellScan) ? snapshot.cellScan.length : 0;
  const bleCount = Array.isArray(snapshot.bleBeacons) ? snapshot.bleBeacons.length : 0;
  const parts: string[] = [];
  if (wifiCount > 0) parts.push(`Wi-Fi ${wifiCount}`);
  if (cellCount > 0) parts.push(`Cells ${cellCount}`);
  if (bleCount > 0) parts.push(`BLE ${bleCount}`);
  return parts.length ? parts.join(" · ") : null;
}

function normalizeLocalMediaUri(uri: string): string {
  const trimmed = String(uri || "").trim();
  if (!trimmed) {
    throw new Error("No media path is available to save.");
  }
  return trimmed.startsWith("file://") ? trimmed : `file://${trimmed}`;
}

async function saveCapturedMediaToLibrary(
  uri: string,
  mediaType: CaptureMediaType
) {
  const normalizedUri = await ensureSavableMediaUri(uri, mediaType);
  const info = await FileSystem.getInfoAsync(normalizedUri);
  if (!info.exists) {
      throw new Error(`File does not exist: ${normalizedUri}`);
  }

  const asset = await MediaLibrary.createAssetAsync(normalizedUri);
  const albumName = "Verity";
  const existingAlbum = await MediaLibrary.getAlbumAsync(albumName);
  if (existingAlbum) {
    await MediaLibrary.addAssetsToAlbumAsync([asset], existingAlbum, false);
  } else {
    await MediaLibrary.createAlbumAsync(albumName, asset, false);
  }
}

async function ensureSavableMediaUri(
  uri: string,
  mediaType: CaptureMediaType
): Promise<string> {
  const normalizedUri = normalizeLocalMediaUri(uri);
  const sourceInfo = await FileSystem.getInfoAsync(normalizedUri);
  if (!sourceInfo.exists) {
      throw new Error(`File does not exist: ${normalizedUri}`);
  }
  const hasExtension = /\.[a-z0-9]+$/i.test(normalizedUri);
  if (hasExtension) return normalizedUri;

  const targetUri = `${FileSystem.cacheDirectory}verity-save-${Date.now()}${
    mediaType === "video" ? ".mp4" : ".jpg"
  }`;
  await FileSystem.copyAsync({
    from: normalizedUri,
    to: targetUri,
  });
  return targetUri;
}
