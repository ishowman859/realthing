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
  Share,
  Linking,
  InteractionManager,
  Platform,
  StatusBar,
} from "react-native";
import { CameraView, CameraMode, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { RegistrationStatus } from "../hooks/useVerityHash";
import {
  FirstStageFilterResult,
  runFirstStageFilter,
} from "../utils/firstStageFilter";
import { HashMode } from "../utils/verityApi";
import { stampMonitorWatermark } from "../utils/monitorWatermark";
import {
  standardizePhotoForHashing,
  StandardizedPhotoMeta,
} from "../utils/standardizePhoto";
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

type ShareVariant = "original" | "proved";
type CaptureMediaType = "photo" | "video";
interface CaptureContext {
  captureTimestamp: number;
  gps: { lat: number; lng: number } | null;
  standardizedPhoto: StandardizedPhotoMeta | null;
}

interface CameraScreenProps {
  status: RegistrationStatus;
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
  computing_hash: "pHash / SHA-256 계산 중...",
  building_tx: "처리 준비 중...",
  awaiting_signature: "서버 전송 준비 중...",
  confirming: "서버에 등록 중...",
  success: "등록 완료, 10초 배치 앵커 대기 중...",
  error: "오류 발생",
};

type LibrarySaveState = "idle" | "ready" | "saving" | "saved" | "error";

export default function CameraScreen({
  status,
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
  /** 동일 촬영·해시 조합으로 갤러리에 한 번만 저장 (Strict Mode 이중 effect 방지) */
  const lastLibrarySaveKeyRef = useRef<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedMediaType, setCapturedMediaType] =
    useState<CaptureMediaType>("photo");
  const [captureContext, setCaptureContext] = useState<CaptureContext | null>(null);
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [cameraMode, setCameraMode] = useState<CameraMode>("picture");
  const [filterResult, setFilterResult] = useState<FirstStageFilterResult | null>(
    null
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedShareVariant, setSelectedShareVariant] =
    useState<ShareVariant>("proved");
  const [monitorCaptureMode, setMonitorCaptureMode] = useState(false);
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
          "미디어 보관함",
          "기기에 등록 기준 표준 JPG/영상 촬영본을 저장하려면 사진/영상 보관함 권한을 허용해 주세요."
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
          ? "등록 기준 원본 영상을 Verity 앨범에 저장하고 있습니다..."
          : "등록 기준 표준 JPG 사진을 Verity 앨범에 저장하고 있습니다..."
      );

    try {
      let granted = mediaLibraryGranted === true;
      if (!granted && requestIfNeeded) {
        granted = await requestMediaLibraryPermission();
      }
      if (!granted) {
        setLibrarySaveState("idle");
        setLibrarySaveMessage(
          "보관함 권한을 허용하면 등록된 촬영본을 기기에 저장할 수 있습니다."
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
          ? "원본 영상이 Verity 앨범에 저장되었습니다. 검증은 이 원본 파일로 다시 올리면 됩니다."
          : "표준 JPG 사진이 Verity 앨범에 저장되었습니다. 검증은 이 JPG 파일로 다시 올리면 됩니다."
      );
    } catch (e) {
      console.warn("saveToLibraryAsync", e);
      setLibrarySaveState("error");
      setLibrarySaveMessage(
        capturedMediaType === "video"
          ? "영상 저장에 실패했습니다. 다시 시도해 주세요."
          : "사진 저장에 실패했습니다. 다시 시도해 주세요."
      );
    }
  };

  useEffect(() => {
    if (status !== "success" || !capturedUri || mediaLibraryGranted !== true) return;
    if (librarySaveState === "saved" || librarySaveState === "saving") return;
    void saveCurrentMediaToLibrary(false);
  }, [status, capturedUri, mediaLibraryGranted]);

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
            카메라 권한이 필요해요
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
            activeOpacity={0.88}
          >
            <Text style={styles.permissionButtonText}>허용하기</Text>
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
        const processedUri = monitorCaptureMode
          ? await stampMonitorWatermark(photo.uri)
          : photo.uri;
        const standardizedPhoto = await standardizePhotoForHashing({
          uri: processedUri,
          width: photo.width,
          height: photo.height,
        });
        setCapturedUri(standardizedPhoto.uri);
        setCaptureContext({
          captureTimestamp: Date.now(),
          gps: extractGpsFromExif(photo.exif),
          standardizedPhoto: standardizedPhoto.meta,
        });
        setFilterResult(null);
        setIsAnalyzing(true);
        try {
          const result = await runFirstStageFilter(processedUri, {
            // [각주1] 모니터 촬영 모드에서는 모아레(주기성) 감지를 건너뜁니다.
            skipPeriodicity: monitorCaptureMode,
          });
          setFilterResult(result);
        } catch {
          setFilterResult({
            decision: "warn",
            score: 40,
            reasons: ["1차 필터 분석에 실패해 보수적으로 재촬영을 권장합니다."],
            metrics: {
              blurVariance: 0,
              periodicityScore: 0,
              metadataRisk: 0,
              antiSpoofScore: null,
              antiSpoofModel: null,
            },
          });
        } finally {
          setIsAnalyzing(false);
        }
      }
    } catch (err) {
      Alert.alert("오류", "사진 촬영에 실패했습니다");
    }
  };

  const toggleCaptureMediaType = (nextType: CaptureMediaType) => {
    if (isRecording) return;
    setCameraMode(nextType === "video" ? "video" : "picture");
    setCapturedMediaType(nextType);
    setFilterResult(null);
    setIsAnalyzing(false);
    if (nextType === "video") {
      setSelectedShareVariant("original");
      setMonitorCaptureMode(false);
    }
  };

  const startVideoRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    try {
      setIsRecording(true);
      setFilterResult(null);
      setIsAnalyzing(false);
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
        });
      }
    } catch (err) {
      Alert.alert("오류", "영상 촬영에 실패했습니다");
    } finally {
      setIsRecording(false);
    }
  };

  const stopVideoRecording = async () => {
    if (!cameraRef.current || !isRecording) return;
    try {
      cameraRef.current.stopRecording();
    } catch (err) {
      Alert.alert("오류", "영상 촬영을 종료하지 못했습니다");
      setIsRecording(false);
    }
  };

  const handleRegister = async (mode: HashMode) => {
    if (!capturedUri) return;
    if (capturedMediaType === "video" && mode === "phash") {
      Alert.alert("안내", "영상은 SHA-256 + pHash 키프레임 경로로 등록됩니다.");
      return;
    }

    const now = Date.now();
    const elapsedMs = now - lastRegisterAtRef.current;
    if (elapsedMs < 1000) {
      Alert.alert("잠시만요", "미디어 등록은 1초에 1회만 가능합니다.");
      return;
    }

    if (isAnalyzing) {
      Alert.alert("검증 중", "미디어 검증이 끝난 뒤 등록할 수 있습니다.");
      return;
    }

    if (filterResult?.decision === "reject") {
      Alert.alert(
        "재촬영 필요",
        "화면 재촬영 의심 신호가 강해 등록을 막았습니다. 다른 각도/거리에서 다시 촬영해주세요."
      );
      return;
    }

    if (filterResult?.decision === "warn") {
      const message =
        filterResult.reasons.length > 0
          ? filterResult.reasons.join("\n")
          : "재촬영 의심 신호가 일부 감지되었습니다.";
      Alert.alert("주의", `${message}\n\n그래도 등록을 진행할까요?`, [
        { text: "다시 촬영", style: "cancel" },
        {
          text: "계속 진행",
          style: "default",
          onPress: () => {
            lastRegisterAtRef.current = Date.now();
            void onRegisterPhoto(
              capturedUri,
              mode,
              filterResult?.score,
              {
                blurVariance: filterResult?.metrics.blurVariance ?? null,
                periodicityScore: filterResult?.metrics.periodicityScore ?? null,
                metadataRisk: filterResult?.metrics.metadataRisk ?? null,
                antiSpoofScore: filterResult?.metrics.antiSpoofScore ?? null,
                antiSpoofModel: filterResult?.metrics.antiSpoofModel ?? null,
                monitorCaptureMode,
                monitorWatermarkApplied: monitorCaptureMode,
                captureMediaType: capturedMediaType,
                captureTimestamp: captureContext?.captureTimestamp ?? Date.now(),
                gps: captureContext?.gps ?? null,
                standardizedPhoto: captureContext?.standardizedPhoto ?? null,
              },
              { mediaType: capturedMediaType }
            );
          },
        },
      ]);
      return;
    }

    lastRegisterAtRef.current = Date.now();
    await onRegisterPhoto(capturedUri, mode, filterResult?.score, {
      blurVariance: filterResult?.metrics.blurVariance ?? null,
      periodicityScore: filterResult?.metrics.periodicityScore ?? null,
      metadataRisk: filterResult?.metrics.metadataRisk ?? null,
      antiSpoofScore: filterResult?.metrics.antiSpoofScore ?? null,
      antiSpoofModel: filterResult?.metrics.antiSpoofModel ?? null,
      monitorCaptureMode,
      monitorWatermarkApplied: monitorCaptureMode,
      captureMediaType: capturedMediaType,
      captureTimestamp: captureContext?.captureTimestamp ?? Date.now(),
      gps: captureContext?.gps ?? null,
      standardizedPhoto: captureContext?.standardizedPhoto ?? null,
    }, { mediaType: capturedMediaType });
  };

  const handleRetake = () => {
    lastLibrarySaveKeyRef.current = null;
    setCapturedUri(null);
    setFilterResult(null);
    setIsAnalyzing(false);
    setCaptureContext(null);
    setSelectedShareVariant("proved");
    setMonitorCaptureMode(false);
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
    await Share.share({
      message: `proved by verity\n선택한 공유 스타일: ${
        selectedShareVariant === "proved" ? "PROVED 테두리" : "표준 JPG"
      }\n검증 링크: ${verificationUrl}`,
    });
  };

  const handleShareQr = async () => {
    if (!qrCodeUrl) return;
    await Share.share({
      message: `verity 검증 QR\n${verificationUrl ?? ""}\n${qrCodeUrl}`,
      url: qrCodeUrl,
    });
  };

  const isPhotoCapture = capturedMediaType === "photo";

  // 촬영 완료 후 결과/등록 화면
  if (capturedUri) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={ui.surface} />
        <View style={[styles.topBar, barShadow]}>
          <TouchableOpacity onPress={onBack} disabled={isProcessing}>
            <Ionicons name="arrow-back" size={24} color={ui.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>등록</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.previewContainer}
          bounces={false}
        >
          {isPhotoCapture ? (
            <>
              <View style={styles.variantSelector}>
                <TouchableOpacity
                  style={[
                    styles.variantCard,
                    selectedShareVariant === "original" && styles.variantCardActive,
                  ]}
                  onPress={() => setSelectedShareVariant("original")}
                >
                  <Image source={{ uri: capturedUri }} style={styles.variantThumb} />
                  <Text style={styles.variantLabel}>표준 JPG</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.variantCard,
                    selectedShareVariant === "proved" && styles.variantCardActive,
                  ]}
                  onPress={() => setSelectedShareVariant("proved")}
                >
                  <View style={styles.variantThumbProved}>
                    <Image source={{ uri: capturedUri }} style={styles.variantThumb} />
                    <View style={styles.provedBadge}>
                      <Text style={styles.provedBadgeText}>PROVED BY VERITY</Text>
                    </View>
                  </View>
                  <Text style={styles.variantLabel}>PROVED 테두리</Text>
                </TouchableOpacity>
              </View>

              {selectedShareVariant === "original" ? (
                <Image source={{ uri: capturedUri }} style={styles.previewImage} />
              ) : (
                <View style={styles.previewProvedContainer}>
                  <Image source={{ uri: capturedUri }} style={styles.previewImage} />
                  <View style={styles.previewFrame}>
                    <Text style={styles.previewFrameText}>PROVED BY VERITY</Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={styles.videoPreviewCard}>
              <Ionicons name="videocam" size={36} color={ui.primary} />
              <Text style={styles.videoPreviewTitle}>영상 촬영 완료</Text>
              <Text style={styles.videoPreviewDesc}>
                이 영상으로 SHA-256과 대표 pHash 키프레임을 계산해 등록합니다.
              </Text>
              <Text style={styles.videoPreviewUri} numberOfLines={2}>
                {capturedUri}
              </Text>
              <View style={styles.videoPill}>
                <Text style={styles.videoPillText}>VIDEO</Text>
              </View>
            </View>
          )}

          {monitorCaptureMode && isPhotoCapture && (
            <View style={styles.monitorBadge}>
              <Text style={styles.monitorBadgeText}>
                MONITOR 워터마크 적용됨 (해시 생성에 포함)
              </Text>
            </View>
          )}

          {isAnalyzing && (
            <View style={styles.filterCard}>
              <ActivityIndicator size="small" color={ui.primary} />
              <Text style={styles.filterCardTitle}>1차 필터 검증 중...</Text>
              <Text style={styles.filterCardDesc}>
                {monitorCaptureMode
                  ? "모니터 촬영 모드로 블러/메타데이터 중심 검증을 진행하고 있습니다."
                  : "화면 재촬영 가능성(블러/패턴/메타데이터)을 검사하고 있습니다."}
              </Text>
              {monitorCaptureMode && (
                <Text style={styles.filterReason}>
                  • 모니터 촬영 모드: 모아레(주기성) 감지는 비활성화됩니다.
                </Text>
              )}
            </View>
          )}

          {!isAnalyzing && filterResult && (
            <View
              style={[
                styles.filterCard,
                filterResult.decision === "pass"
                  ? styles.filterPass
                  : filterResult.decision === "warn"
                  ? styles.filterWarn
                  : styles.filterReject,
              ]}
            >
              <Text style={styles.filterCardTitle}>
                1차 필터 점수: {filterResult.score}/100
              </Text>
              <Text style={styles.filterCardDesc}>
                {filterResult.decision === "pass"
                  ? "문제 신호가 낮아 등록을 진행할 수 있습니다."
                  : filterResult.decision === "warn"
                  ? "의심 신호가 일부 감지되었습니다. 재촬영 권장."
                  : "의심 신호가 강해 등록이 차단됩니다."}
              </Text>
              {filterResult.reasons.slice(0, 2).map((reason) => (
                <Text key={reason} style={styles.filterReason}>
                  • {reason}
                </Text>
              ))}
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

              <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
              {hashMode && (
                <Text style={styles.modeMetaText}>
                  등록 모드: {hashMode === "sha256" ? "SHA-256" : "pHash"}
                </Text>
              )}
              {status === "success" && (currentSha256 || currentPhash) ? (
                <Text style={styles.saveHintText}>
                  {capturedMediaType === "video"
                    ? "등록된 원본 영상을 Verity 앨범에 저장합니다. 해시값은 파일 위에 새기지 않고, 머클 배치 정보는 검증 페이지에서 확인합니다."
                    : "등록된 표준 JPG 사진을 Verity 앨범에 저장합니다. 해시값은 파일 위에 새기지 않고, 머클 배치 정보는 검증 페이지에서 확인합니다."}
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
                  <Text style={styles.hashLabel}>검증 URL</Text>
                  <Text style={styles.hashValue} numberOfLines={1}>
                    {verificationUrl}
                  </Text>
                  <Text style={styles.anchorHintText}>
                    서버가 약 10초 단위로 SHA-256 / pHash 머클트리를 묶어 Solana에 루트를 앵커링합니다.
                    잠시 후 검증 페이지에서 두 트리 상태를 확인할 수 있습니다.
                  </Text>
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => Linking.openURL(verificationUrl)}
                  >
                    <Text style={styles.linkButtonText}>검증 페이지 열기</Text>
                  </TouchableOpacity>
                </View>
              )}

              {qrCodeUrl && (
                <View style={styles.hashContainer}>
                  <Text style={styles.hashLabel}>QR 코드</Text>
                  <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} />
                  <TouchableOpacity style={styles.linkButton} onPress={handleShareQr}>
                    <Text style={styles.linkButtonText}>QR 이미지 공유</Text>
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
              <Text style={styles.libraryCardTitle}>기기 저장</Text>
              <Text style={styles.libraryCardDesc}>
                {librarySaveMessage
                  ? librarySaveMessage
                  : mediaLibraryGranted === true
                    ? "등록이 완료되면 표준 JPG 촬영본이 기기 보관함의 Verity 앨범에 저장됩니다."
                    : "기기에 저장하려면 사진/영상 보관함 권한을 허용해 주세요."}
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
                      ? "권한 요청 중..."
                      : librarySaveState === "saving"
                        ? "저장 중..."
                        : librarySaveState === "saved"
                          ? "저장 완료"
                          : mediaLibraryGranted === true
                            ? "기기에 저장"
                            : "권한 허용 후 저장"}
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
                  <Text style={styles.retakeText}>다시 촬영</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.registerButton}
                  onPress={() => handleRegister("sha256")}
                >
                  <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
                  <Text style={styles.registerText}>SHA-256 + pHash 제출</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.registerButtonSecondary}
                  onPress={() => handleRegister("phash")}
                >
                  <Ionicons name="images" size={20} color={ui.primary} />
                  <Text style={styles.registerTextSecondary}>pHash 루트</Text>
                </TouchableOpacity>
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
                    {capturedMediaType === "video" ? "새 영상 촬영" : "새 사진 촬영"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.doneButton} onPress={onBack}>
                  <Text style={styles.doneText}>완료</Text>
                </TouchableOpacity>

                {!!verificationUrl && (
                  <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
                    <Ionicons name="share-social" size={18} color={ui.primary} />
                    <Text style={styles.shareButtonText}>
                      {selectedShareVariant === "proved"
                        ? "PROVED 버전 공유"
                        : "표준 JPG 공유"}
                    </Text>
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
                  <Text style={styles.retakeText}>다시 시도</Text>
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
        <Text style={styles.topBarTitle}>촬영</Text>
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
            사진
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
            영상
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
        <TouchableOpacity
          style={[
            styles.monitorModeButton,
            monitorCaptureMode && styles.monitorModeButtonActive,
            cameraMode === "video" && styles.monitorModeButtonDisabled,
          ]}
          onPress={() => {
            if (cameraMode === "video") return;
            setMonitorCaptureMode((prev) => !prev);
          }}
        >
          <Text style={styles.monitorModeButtonText}>
            {cameraMode === "video"
              ? "MONITOR N/A"
              : monitorCaptureMode
                ? "MONITOR ON"
                : "MONITOR OFF"}
          </Text>
        </TouchableOpacity>
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
                ? "녹화 중"
                : "영상"
              : "사진"}
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
  variantSelector: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  variantCard: {
    flex: 1,
    backgroundColor: ui.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: ui.borderLight,
    padding: 8,
  },
  variantCardActive: {
    borderColor: ui.primary,
    backgroundColor: ui.primarySoft,
  },
  variantThumb: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
  },
  variantThumbProved: {
    borderWidth: 2,
    borderColor: ui.text,
    borderRadius: 10,
    overflow: "hidden",
  },
  variantLabel: {
    color: ui.text,
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
    fontWeight: "700",
  },
  provedBadge: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: ui.text,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  provedBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  previewProvedContainer: {
    width: "100%",
    position: "relative",
    marginBottom: 20,
  },
  previewFrame: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 20,
    backgroundColor: ui.text,
    paddingVertical: 8,
  },
  previewFrameText: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
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
  filterCard: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.borderLight,
  },
  filterPass: {
    borderColor: ui.success,
    backgroundColor: ui.successSoft,
  },
  filterWarn: {
    borderColor: ui.warning,
    backgroundColor: ui.warningSoft,
  },
  filterReject: {
    borderColor: ui.danger,
    backgroundColor: ui.dangerSoft,
  },
  filterCardTitle: {
    color: ui.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },
  filterCardDesc: {
    color: ui.textSecondary,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  filterReason: {
    color: ui.text,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 20,
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
  monitorModeButton: {
    minWidth: 98,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.canvas,
    alignItems: "center",
  },
  monitorModeButtonActive: {
    borderColor: ui.warning,
    backgroundColor: ui.warningSoft,
  },
  monitorModeButtonDisabled: {
    opacity: 0.55,
  },
  monitorModeButtonText: {
    color: ui.text,
    fontSize: 11,
    fontWeight: "800",
  },
  monitorBadge: {
    width: "100%",
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.warning,
    backgroundColor: ui.warningSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  monitorBadgeText: {
    color: ui.text,
    fontSize: 13,
    fontWeight: "700",
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

function normalizeLocalMediaUri(uri: string): string {
  const trimmed = String(uri || "").trim();
  if (!trimmed) {
    throw new Error("저장할 미디어 경로가 없습니다.");
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
    throw new Error(`파일이 존재하지 않습니다: ${normalizedUri}`);
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
    throw new Error(`파일이 존재하지 않습니다: ${normalizedUri}`);
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
