import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Platform,
  StatusBar,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  recheckVerificationByToken,
  uploadVerificationMedia,
  MediaType,
  VerificationMerkleTree,
  VerificationLookupPayload,
} from "../utils/verityApi";
import {
  createClientLeafHash,
  verifyMerkleProofClient,
} from "../utils/merkleVerifyClient";
import {
  buildMerklePathLevels,
  shortHashHex,
  MerklePathLevel,
} from "../utils/merklePathLevels";
import { ui } from "../theme/tokens";

interface VerifyScreenProps {
  onBack: () => void;
  initialToken?: string;
}

interface SelectedMediaState {
  uri: string;
  mediaType: MediaType;
  fileName?: string | null;
  mimeType?: string | null;
}

const cardShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      }
    : { elevation: 2 };

function formatDateTime(value: string | number | undefined): string {
  if (value === undefined || value === null) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR");
}

type MerkleVizState =
  | "idle"
  | "loading"
  | { error: string }
  | {
      ok: {
        topDown: MerklePathLevel[];
        serverRoot: string;
        match: boolean;
      };
    };

function MerkleTreeVizPanel({ state }: { state: MerkleVizState }) {
  if (state === "idle") return null;
  if (state === "loading") {
    return (
      <View style={styles.merkleVizBox}>
        <ActivityIndicator color={ui.primary} />
        <Text style={styles.merkleVizHint}>경로 해시 계산 중…</Text>
      </View>
    );
  }
  if ("error" in state) {
    return (
      <View style={styles.merkleVizBox}>
        <Text style={styles.merkleVizErr}>{state.error}</Text>
      </View>
    );
  }
  const { topDown, serverRoot, match } = state.ok;
  return (
    <View style={styles.merkleVizBox}>
      <Text style={styles.merkleVizTitle}>머클 경로 시각화 (루트 → 리프)</Text>
      <View
        style={[
          styles.merkleVizBanner,
          match ? styles.merkleVizBannerOk : styles.merkleVizBannerBad,
        ]}
      >
        <Text
          style={[
            styles.merkleVizBannerText,
            match ? { color: "#047857" } : { color: "#b91c1c" },
          ]}
        >
          {match
            ? "재계산 루트가 공개 루트와 일치합니다."
            : "재계산 루트가 공개 루트와 다릅니다."}
        </Text>
      </View>
      <View style={styles.merkleVizNodeRoot}>
        <Text style={styles.merkleVizBadgeRoot}>ROOT</Text>
        <Text style={styles.merkleVizHash} selectable>
          {serverRoot}
        </Text>
      </View>
      {Array.from({ length: topDown.length - 1 }, (_, k) => {
        const upper = topDown[k];
        const lower = topDown[k + 1];
        const isLast = k === topDown.length - 2;
        const formula =
          upper.position === "left" ? "H(이웃 ‖ 하위)" : "H(하위 ‖ 이웃)";
        return (
          <View key={`merkle-viz-${k}`}>
            <Text style={styles.merkleVizConn}>↓</Text>
            <View style={styles.merkleVizStep}>
              <Text style={styles.merkleVizStepLab}>병합 · {formula}</Text>
              <Text style={styles.merkleVizSib} selectable>
                {upper.sibling}
              </Text>
              <Text style={styles.merkleVizPos}>
                {String(upper.position || "").toUpperCase()}
              </Text>
              <Text style={styles.merkleVizChildHint}>
                하위 노드: {shortHashHex(upper.childHash || "")}
              </Text>
            </View>
            <View
              style={[styles.merkleVizNode, isLast && styles.merkleVizNodeLeaf]}
            >
              <Text
                style={[
                  styles.merkleVizBadge,
                  isLast && styles.merkleVizBadgeLeaf,
                ]}
              >
                {isLast ? "LEAF" : String(k + 1)}
              </Text>
              <Text style={styles.merkleVizHash} selectable>
                {lower.hash}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MerkleTreeSummary({
  label,
  tree,
}: {
  label: string;
  tree?: VerificationMerkleTree | null;
}) {
  if (!tree) return null;
  const proofCount = Array.isArray(tree.proof) ? tree.proof.length : 0;
  return (
    <View style={styles.treeSummaryCard}>
      <Text style={styles.treeSummaryTitle}>{label}</Text>
      <Field label="상태" value={tree.verified ? "검증 가능" : tree.reason || "대기"} />
      <Field label="루트" value={tree.storedRoot} mono small />
      <Field label="리프" value={tree.leafHash} mono small />
      <Field label="경로 길이" value={proofCount ? String(proofCount) : "-"} />
    </View>
  );
}

export default function VerifyScreen({
  onBack,
  initialToken = "",
}: VerifyScreenProps) {
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [verifyingMerkle, setVerifyingMerkle] = useState(false);
  const [data, setData] = useState<VerificationLookupPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [merkleMsg, setMerkleMsg] = useState<string | null>(null);
  const [merkleOk, setMerkleOk] = useState<boolean | null>(null);
  const [merkleViz, setMerkleViz] = useState<MerkleVizState>("idle");

  const proofList = useMemo(() => {
    if (data && Array.isArray(data.merkleProof)) return data.merkleProof;
    return [];
  }, [data]);

  useEffect(() => {
    if (!data?.merkleRoot || proofList.length === 0) {
      setMerkleViz("idle");
      return;
    }
    let cancelled = false;
    setMerkleViz("loading");
    (async () => {
      try {
        let leaf = (data.merkleLeafHash || "").trim();
        if (!leaf && data.assetId) {
          leaf = await createClientLeafHash(data);
        }
        if (!leaf) {
          if (!cancelled) {
            setMerkleViz({
              error: "리프 해시가 없어 경로를 표시할 수 없습니다.",
            });
          }
          return;
        }
        const { levels, computedRoot, badProof } = await buildMerklePathLevels(
          leaf,
          proofList
        );
        if (badProof) {
          if (!cancelled) {
            setMerkleViz({
              error: "머클 경로 형식이 올바르지 않습니다.",
            });
          }
          return;
        }
        const serverRoot = String(data.merkleRoot || "");
        if (!cancelled) {
          setMerkleViz({
            ok: {
              topDown: levels.slice().reverse(),
              serverRoot,
              match: !!(serverRoot && computedRoot === serverRoot),
            },
          });
        }
      } catch (e) {
        if (!cancelled) {
          setMerkleViz({
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, proofList]);

  const pickMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("권한 필요", "사진/영상 검증을 위해 미디어 라이브러리 접근 권한이 필요합니다.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 1,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mediaType: MediaType = asset.type === "video" ? "video" : "photo";
    setSelectedMedia({
      uri: asset.uri,
      mediaType,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
    });
    setError(null);
  }, []);

  const uploadAndVerify = useCallback(async () => {
    if (!selectedMedia) {
      Alert.alert("알림", "검증할 사진 또는 영상을 먼저 선택하세요.");
      return;
    }
    setUploading(true);
    setError(null);
    setMerkleMsg(null);
    setMerkleOk(null);
    setMerkleViz("idle");
    try {
      const payload = await uploadVerificationMedia(selectedMedia);
      setData(payload.verification);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, [selectedMedia]);

  const recheck = useCallback(async () => {
    const t = (data?.token || initialToken || "").trim();
    if (!t || !data) return;
    setRechecking(true);
    setError(null);
    try {
      const payload = await recheckVerificationByToken(t);
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRechecking(false);
    }
  }, [data, initialToken]);

  const runMerkleVerify = useCallback(async () => {
    if (!data) return;
    const proof = Array.isArray(data.merkleProof) ? data.merkleProof : null;
    const root = data.merkleRoot;
    if (!proof?.length || !root) {
      setMerkleMsg("머클 경로가 아직 없습니다.");
      setMerkleOk(false);
      return;
    }
    setVerifyingMerkle(true);
    setMerkleMsg(null);
    setMerkleOk(null);
    try {
      const lines: string[] = [];
      let pathLeaf = data.merkleLeafHash || "";
      if (data.assetId) {
        const recomputed = await createClientLeafHash(data);
        if (data.merkleLeafHash) {
          if (recomputed === data.merkleLeafHash) {
            lines.push("직렬화 리프가 서버 기록과 일치합니다.");
            pathLeaf = recomputed;
          } else {
            lines.push(
              "경고: 재계산 리프 ≠ 서버 merkleLeafHash. 서버 리프로 경로만 검증합니다."
            );
            pathLeaf = data.merkleLeafHash;
          }
        } else {
          pathLeaf = recomputed;
        }
      } else {
        lines.push("assetId 없음: 서버가 준 리프 해시로만 경로를 검증합니다.");
      }
      if (!pathLeaf) {
        setMerkleMsg(`${lines.join(" ")} 검증 실패`);
        setMerkleOk(false);
        return;
      }
      const ok = await verifyMerkleProofClient(pathLeaf, proof, root);
      lines.push(
        ok
          ? "머클 경로 검증 성공: 계산 루트가 공개 루트와 일치합니다."
          : "머클 경로 불일치."
      );
      setMerkleMsg(lines.join("\n"));
      setMerkleOk(ok);
    } finally {
      setVerifyingMerkle(false);
    }
  }, [data]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={ui.canvas} />
        <View style={styles.toolbar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.toolbarTitle}>검증 조회</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, cardShadow]}>
          <Text style={styles.cardTitle}>업로드 검증</Text>
          <Text style={styles.cardHint}>
            사진이나 영상을 선택하면 앱이 서버로 업로드하고, 서버가 해시를 계산해 배치/머클트리/루트해시/Solana 앵커까지 확인합니다.
          </Text>
          <TouchableOpacity
            style={[styles.outlineBtn, uploading && styles.btnDisabled]}
            onPress={pickMedia}
            disabled={uploading}
            activeOpacity={0.85}
          >
            <Text style={styles.outlineBtnText}>사진/영상 선택</Text>
          </TouchableOpacity>
          {selectedMedia ? (
            <View style={styles.selectedMediaCard}>
              <Text style={styles.selectedMediaLabel}>
                선택됨: {selectedMedia.mediaType === "video" ? "영상" : "사진"}
              </Text>
              <Text style={styles.selectedMediaPath} numberOfLines={2}>
                {selectedMedia.fileName || selectedMedia.uri}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryBtn, uploading && styles.btnDisabled]}
            onPress={uploadAndVerify}
            disabled={uploading}
            activeOpacity={0.85}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>업로드 후 검증</Text>
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={[styles.warnBox, cardShadow]}>
            <Ionicons name="alert-circle" size={22} color={ui.danger} />
            <Text style={styles.warnText}>{error}</Text>
          </View>
        ) : null}

        {data ? (
          <View style={[styles.card, cardShadow]}>
            <Text style={styles.sectionLabel}>요약</Text>
            <Field label="일련번호" value={data.serial} />
            <Field label="모드" value={(data.mode || "-").toUpperCase()} />
            <Field label="소유자" value={data.owner} mono />
            <Field
              label="생성 시각"
              value={data.createdAt ? formatDateTime(data.createdAt) : "-"}
            />
            <Field
              label="촬영 시각"
              value={
                data.capturedTimestampMs != null
                  ? formatDateTime(Number(data.capturedTimestampMs))
                  : "-"
              }
            />
            <Field
              label="온체인 시각"
              value={
                data.onchainTimestampMs != null
                  ? formatDateTime(Number(data.onchainTimestampMs))
                  : "-"
              }
            />
            <Field
              label="AI 1차 점수"
              value={
                typeof data.aiRiskScore === "number"
                  ? `${data.aiRiskScore} / 100`
                  : "-"
              }
            />
            <Field label="SHA-256" value={data.sha256} mono small />
            <Field label="pHash" value={data.phash} mono small />
            <Field
              label="앵커 저장 위치"
              value={
                data.batchAnchor?.source === "solana" ? "Solana + DB" : "DB only"
              }
            />
            <Field
              label="배치 SHA-256 루트"
              value={data.batchMerkleRoots?.sha256}
              mono
              small
            />
            <Field
              label="배치 pHash 루트"
              value={data.batchMerkleRoots?.phash}
              mono
              small
            />
            <Field
              label="배치 TX / 서명"
              value={data.batchAnchor?.txHash || data.chainTxSignature}
              mono
              small
            />
            {data.batchAnchor?.payload ? (
              <View style={styles.anchorPayloadBox}>
                <Text style={styles.proofTitle}>Solana / DB 앵커 payload</Text>
                <Text style={styles.anchorPayloadText} selectable>
                  {JSON.stringify(data.batchAnchor.payload, null, 2)}
                </Text>
              </View>
            ) : null}
            {data.batchAnchor?.explorerUrl ? (
              <TouchableOpacity
                style={[styles.outlineBtn, { marginBottom: 12 }]}
                onPress={() => Linking.openURL(String(data.batchAnchor?.explorerUrl))}
              >
                <Text style={styles.outlineBtnText}>Solana Explorer 열기</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              머클 · 배치
            </Text>
            <MerkleTreeSummary
              label="SHA-256 트리"
              tree={data.merkleTrees?.sha256}
            />
            <MerkleTreeSummary
              label="pHash 트리"
              tree={data.merkleTrees?.phash}
            />
            <MerkleTreeVizPanel state={merkleViz} />
            <Field
              label="현재 표시 트리"
              value={data.merkleTreeType === "phash" ? "pHash" : "SHA-256"}
            />
            <Field
              label="인덱스 블록"
              value={
                data.indexedBlockNumber != null
                  ? String(data.indexedBlockNumber)
                  : "-"
              }
              mono
            />
            <Field label="봉인 루트" value={data.merkleRoot} mono small />
            <Field
              label="재계산 루트"
              value={data.computedMerkleRoot}
              mono
              small
            />
            <Field label="리프(직렬화)" value={data.merkleLeafHash} mono small />
            <Field
              label="경로 길이"
              value={proofList.length ? String(proofList.length) : "-"}
            />
            {proofList.length > 0 ? (
              <View style={styles.proofBlock}>
                <Text style={styles.proofTitle}>이웃 해시</Text>
                {proofList.map((n, i) => (
                  <Text key={i} style={styles.proofLine} selectable>
                    {i + 1}. {n.position}: {n.hash}
                  </Text>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.outlineBtn,
                (!proofList.length || verifyingMerkle) && styles.btnDisabled,
              ]}
              onPress={runMerkleVerify}
              disabled={!proofList.length || verifyingMerkle}
            >
              {verifyingMerkle ? (
                <ActivityIndicator color={ui.primary} />
              ) : (
                <Text style={styles.outlineBtnText}>머클 경로 검증</Text>
              )}
            </TouchableOpacity>
            {merkleMsg ? (
              <Text
                style={[
                  styles.merkleResult,
                  merkleOk === true && { color: ui.success },
                  merkleOk === false && { color: ui.danger },
                ]}
              >
                {merkleMsg}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.outlineBtn,
                { marginTop: 12 },
                rechecking && styles.btnDisabled,
              ]}
              onPress={recheck}
              disabled={rechecking}
            >
              {rechecking ? (
                <ActivityIndicator color={ui.primary} />
              ) : (
                <Text style={styles.outlineBtnText}>서버 재검증</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  small?: boolean;
}) {
  const v = value && String(value).trim() ? String(value) : "-";
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[styles.fieldValue, mono && styles.mono, small && styles.small]}
        selectable
      >
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ui.canvas },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: ui.borderLight,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  toolbarTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: ui.text,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: ui.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: ui.borderLight,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: ui.text, marginBottom: 6 },
  cardHint: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 19,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.55 },
  warnBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: ui.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: ui.borderLight,
    marginBottom: 14,
  },
  warnText: { flex: 1, fontSize: 14, color: ui.text, lineHeight: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: ui.textSecondary,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: ui.textMuted, marginBottom: 2 },
  fieldValue: { fontSize: 15, color: ui.text, fontWeight: "600" },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13 },
  small: { fontSize: 12 },
  proofBlock: {
    marginTop: 8,
    marginBottom: 12,
    padding: 12,
    backgroundColor: ui.canvas,
    borderRadius: 10,
  },
  proofTitle: { fontSize: 12, fontWeight: "700", color: ui.textSecondary, marginBottom: 8 },
  proofLine: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: ui.text,
    marginBottom: 6,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: ui.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  outlineBtnText: { color: ui.primary, fontSize: 15, fontWeight: "700" },
  merkleResult: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: ui.textSecondary,
  },
  merkleVizBox: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(49, 130, 246, 0.25)",
    backgroundColor: "rgba(49, 130, 246, 0.06)",
  },
  merkleVizTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: ui.textSecondary,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  merkleVizHint: {
    marginTop: 8,
    fontSize: 13,
    color: ui.textMuted,
    textAlign: "center",
  },
  merkleVizErr: {
    fontSize: 13,
    color: ui.danger,
    lineHeight: 20,
  },
  merkleVizBanner: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  merkleVizBannerOk: {
    backgroundColor: "rgba(20, 241, 149, 0.12)",
    borderColor: "rgba(13, 159, 110, 0.25)",
  },
  merkleVizBannerBad: {
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    borderColor: "rgba(220, 38, 38, 0.2)",
  },
  merkleVizBannerText: {
    fontSize: 12,
    fontWeight: "700",
  },
  merkleVizNodeRoot: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(13, 159, 110, 0.45)",
    backgroundColor: "rgba(20, 241, 149, 0.1)",
    marginBottom: 4,
  },
  merkleVizBadgeRoot: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    backgroundColor: "#0d9f6e",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  merkleVizNode: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surface,
  },
  merkleVizNodeLeaf: {
    borderColor: "rgba(49, 130, 246, 0.35)",
    backgroundColor: "rgba(49, 130, 246, 0.06)",
  },
  merkleVizBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    backgroundColor: ui.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  merkleVizBadgeLeaf: {
    backgroundColor: ui.primary,
  },
  merkleVizHash: {
    flex: 1,
    minWidth: 120,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: ui.text,
  },
  merkleVizConn: {
    textAlign: "center",
    color: ui.textMuted,
    fontSize: 16,
    marginVertical: 2,
  },
  merkleVizStep: {
    marginLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(49, 130, 246, 0.35)",
    paddingLeft: 12,
    marginBottom: 6,
    gap: 6,
  },
  merkleVizStepLab: {
    fontSize: 10,
    fontWeight: "700",
    color: ui.textMuted,
    textTransform: "uppercase",
  },
  merkleVizSib: {
    fontSize: 9,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: ui.text,
    backgroundColor: ui.canvas,
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: ui.border,
  },
  merkleVizPos: {
    fontSize: 11,
    fontWeight: "800",
    color: ui.textSecondary,
  },
  merkleVizChildHint: {
    fontSize: 11,
    color: ui.textMuted,
  },
  treeSummaryCard: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.borderLight,
    backgroundColor: ui.canvas,
  },
  treeSummaryTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: ui.primary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedMediaCard: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: ui.canvas,
    borderWidth: 1,
    borderColor: ui.borderLight,
  },
  selectedMediaLabel: {
    color: ui.primary,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  selectedMediaPath: {
    color: ui.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  anchorPayloadBox: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: ui.canvas,
    borderRadius: 10,
  },
  anchorPayloadText: {
    fontSize: 11,
    lineHeight: 16,
    color: ui.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
