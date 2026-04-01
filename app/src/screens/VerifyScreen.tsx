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
  fetchVerificationByToken,
  recheckVerificationByToken,
  uploadVerificationMedia,
  MediaType,
  VerificationMerkleTree,
  VerificationLookupPayload,
  VerificationLookupError,
  VerificationSearchCandidate,
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

interface SearchResultMetaState {
  exactMatchType: "sha256" | null;
  bestPhashScore: number | null;
  exactPhashMatch: VerificationSearchCandidate | null;
  similarMatchesCount: number;
}

const PHASH_TRUST_NOTE =
  "Re-encoding or re-saving can prevent a 100% pHash match and a SHA-256 exact match. A pHash score around 90% can still be considered trustworthy.";

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
  return d.toLocaleString("en-US");
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
        <Text style={styles.merkleVizHint}>Computing path hashes…</Text>
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
      <Text style={styles.merkleVizTitle}>Merkle path visualization (root to leaf)</Text>
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
            ? "The recomputed root matches the published root."
            : "The recomputed root does not match the published root."}
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
          upper.position === "left" ? "H(sibling || child)" : "H(child || sibling)";
        return (
          <View key={`merkle-viz-${k}`}>
            <Text style={styles.merkleVizConn}>↓</Text>
            <View style={styles.merkleVizStep}>
              <Text style={styles.merkleVizStepLab}>Merge · {formula}</Text>
              <Text style={styles.merkleVizSib} selectable>
                {upper.sibling}
              </Text>
              <Text style={styles.merkleVizPos}>
                {String(upper.position || "").toUpperCase()}
              </Text>
              <Text style={styles.merkleVizChildHint}>
                Child node: {shortHashHex(upper.childHash || "")}
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
      <Field label="Status" value={tree.verified ? "Verifiable" : tree.reason || "Pending"} />
      <Field label="Root" value={tree.storedRoot} mono small />
      <Field label="Leaf" value={tree.leafHash} mono small />
      <Field label="Path length" value={proofCount ? String(proofCount) : "-"} />
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
  const [matchHint, setMatchHint] = useState<string | null>(null);
  const [searchMeta, setSearchMeta] = useState<SearchResultMetaState | null>(null);
  const [merkleMsg, setMerkleMsg] = useState<string | null>(null);
  const [merkleOk, setMerkleOk] = useState<boolean | null>(null);
  const [merkleViz, setMerkleViz] = useState<MerkleVizState>("idle");
  const [showDetails, setShowDetails] = useState(false);
  const [candidates, setCandidates] = useState<VerificationSearchCandidate[]>([]);
  const [loadingCandidateToken, setLoadingCandidateToken] = useState<string | null>(null);

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
              error: "The leaf hash is missing, so the path cannot be displayed.",
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
              error: "The Merkle path format is invalid.",
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
      Alert.alert("Permission required", "Media library access is required to verify photos and videos.");
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
      Alert.alert("Notice", "Select a photo or video to verify first.");
      return;
    }
    setUploading(true);
    setError(null);
    setMatchHint(null);
    setSearchMeta(null);
    setCandidates([]);
    setMerkleMsg(null);
    setMerkleOk(null);
    setMerkleViz("idle");
    try {
      const payload = await uploadVerificationMedia(selectedMedia);
      setData(payload.verification || null);
      setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
      setSearchMeta({
        exactMatchType: payload.exactMatchType || null,
        bestPhashScore: payload.bestPhashScore ?? null,
        exactPhashMatch: payload.exactPhashMatch ?? null,
        similarMatchesCount: Array.isArray(payload.similarMatches)
          ? payload.similarMatches.length
          : 0,
      });
    } catch (e) {
      setData(null);
      setCandidates(e instanceof VerificationLookupError ? e.candidates : []);
      if (e instanceof VerificationLookupError) {
        const hints: string[] = [];
        if (e.exactPhashMatch) {
          hints.push(
            `A matching pHash record exists, but there is no SHA-256 exact match. Serial: ${
              e.exactPhashMatch.serial || "-"
            }`
          );
        } else if (e.similarMatches.length > 0) {
          hints.push(
            `${e.similarMatches.length} similar pHash candidates were found, but none is an exact match.`
          );
        }
        if (typeof e.bestPhashScore === "number") {
          hints.push(`Best similarity: ${e.bestPhashScore.toFixed(2)}%`);
        }
        if (
          e.exactPhashMatch ||
          (typeof e.bestPhashScore === "number" && e.bestPhashScore >= 90)
        ) {
          hints.push(PHASH_TRUST_NOTE);
        }
        setMatchHint(hints.join("\n") || null);
        setSearchMeta({
          exactMatchType: null,
          bestPhashScore: e.bestPhashScore ?? null,
          exactPhashMatch: e.exactPhashMatch ?? null,
          similarMatchesCount: e.similarMatches.length,
        });
      } else {
        setMatchHint(null);
        setSearchMeta(null);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, [selectedMedia]);

  const selectCandidate = useCallback(async (candidate: VerificationSearchCandidate) => {
    const token = String(candidate?.token || "").trim();
    if (!token) return;
    setLoadingCandidateToken(token);
    setError(null);
    setMerkleMsg(null);
    setMerkleOk(null);
    try {
      const payload = await fetchVerificationByToken(token);
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingCandidateToken(null);
    }
  }, []);

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
      setMerkleMsg("The Merkle path is not available yet.");
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
            lines.push("The serialized leaf matches the server record.");
            pathLeaf = recomputed;
          } else {
            lines.push(
              "Warning: the recomputed leaf does not match the server merkleLeafHash. The path will be verified using the server leaf only."
            );
            pathLeaf = data.merkleLeafHash;
          }
        } else {
          pathLeaf = recomputed;
        }
      } else {
        lines.push("No assetId is available, so the path will be verified only with the server-provided leaf hash.");
      }
      if (!pathLeaf) {
        setMerkleMsg(`${lines.join(" ")} Verification failed.`);
        setMerkleOk(false);
        return;
      }
      const ok = await verifyMerkleProofClient(pathLeaf, proof, root);
      lines.push(
        ok
          ? "Merkle path verification succeeded: the computed root matches the published root."
          : "Merkle path mismatch."
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
        <Text style={styles.toolbarTitle}>Verification Lookup</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, cardShadow]}>
          <Text style={styles.cardTitle}>Upload Verification</Text>
          <Text style={styles.cardHint}>
            Select a photo or video and the app will compute its hashes, look for an exact match, and let you review batch, Merkle tree, root hash, and Solana anchor details in the expanded view.
          </Text>
          <Text style={styles.cardHint}>{PHASH_TRUST_NOTE}</Text>
          <TouchableOpacity
            style={[styles.outlineBtn, uploading && styles.btnDisabled]}
            onPress={pickMedia}
            disabled={uploading}
            activeOpacity={0.85}
          >
            <Text style={styles.outlineBtnText}>Choose Photo or Video</Text>
          </TouchableOpacity>
          {selectedMedia ? (
            <View style={styles.selectedMediaCard}>
              <Text style={styles.selectedMediaLabel}>
                Selected: {selectedMedia.mediaType === "video" ? "Video" : "Photo"}
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
              <Text style={styles.primaryBtnText}>Upload and Verify</Text>
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={[styles.warnBox, cardShadow]}>
            <Ionicons name="alert-circle" size={22} color={ui.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnText}>{error}</Text>
              {matchHint ? (
                <Text style={styles.warnSubText}>{matchHint}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {candidates.length > 0 ? (
          <View style={[styles.card, cardShadow]}>
            <Text style={styles.sectionLabel}>Candidate matches</Text>
            <Text style={styles.cardHint}>
              Step 1: pHash similarity narrowed the search set. Step 2: choose one candidate to load its proof and on-chain batch record.
            </Text>
            {candidates.map((candidate) => {
              const scoreText =
                typeof candidate.score === "number"
                  ? `${candidate.score.toFixed(2)}%`
                  : "-";
              const distanceText =
                typeof candidate.hammingDistance === "number"
                  ? String(candidate.hammingDistance)
                  : "-";
              const isLoading = loadingCandidateToken === candidate.token;
              return (
                <TouchableOpacity
                  key={candidate.token}
                  style={styles.candidateCard}
                  onPress={() => {
                    void selectCandidate(candidate);
                  }}
                  disabled={isLoading}
                  activeOpacity={0.88}
                >
                  <View style={styles.candidateHeader}>
                    <Text style={styles.candidateSerial}>
                      {candidate.serial || candidate.token}
                    </Text>
                    <Text style={styles.candidateScore}>{scoreText}</Text>
                  </View>
                  <Text style={styles.candidateMeta}>
                    {candidate.matchType || "similar_phash"} · Hamming {distanceText}
                  </Text>
                  <Text style={styles.candidateMeta}>
                    {candidate.owner || "-"} · {candidate.mediaType || "-"}
                  </Text>
                  <Text style={styles.candidateHash} numberOfLines={1}>
                    Combined hash ({candidate.combinedHashType || "phash"}):{" "}
                    {candidate.combinedHash || "-"}
                  </Text>
                  <View style={styles.candidateFooter}>
                    <Text style={styles.candidateProof}>
                      {candidate.proofReady
                        ? "Proof available"
                        : "Proof pending batch finalization"}
                    </Text>
                    {isLoading ? (
                      <ActivityIndicator color={ui.primary} />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={ui.primary}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {data ? (
          <View style={[styles.card, cardShadow]}>
            <Text style={styles.sectionLabel}>Summary</Text>
            <Field label="Serial" value={data.serial} />
            <Field label="Mode" value={(data.mode || "-").toUpperCase()} />
            <Field
              label="Created at"
              value={data.createdAt ? formatDateTime(data.createdAt) : "-"}
            />
            <Field
              label="Captured at"
              value={
                data.capturedTimestampMs != null
                  ? formatDateTime(Number(data.capturedTimestampMs))
                  : "-"
              }
            />
            <Field
              label="Anchored at"
              value={
                data.onchainTimestampMs != null
                  ? formatDateTime(Number(data.onchainTimestampMs))
                  : "-"
              }
            />
            <Field
              label="Match result"
              value={
                searchMeta?.exactMatchType === "sha256"
                  ? "SHA-256 exact match · 100% match"
                  : searchMeta?.exactPhashMatch
                    ? `pHash exact match · similar content`
                    : typeof searchMeta?.bestPhashScore === "number"
                      ? `pHash candidate match · ${searchMeta.bestPhashScore.toFixed(2)}%`
                      : "SHA-256 exact match · 100% match"
              }
            />
            <Field
              label="Metadata summary"
              value={summarizeMetadata(data.metadata)}
            />
            {(searchMeta?.exactPhashMatch ||
              (typeof searchMeta?.bestPhashScore === "number" &&
                searchMeta.bestPhashScore >= 90)) ? (
              <Text style={styles.cardHint}>{PHASH_TRUST_NOTE}</Text>
            ) : null}
            <MerkleTreeVizPanel state={merkleViz} />
            <TouchableOpacity
              style={[styles.outlineBtn, { marginTop: 8, marginBottom: 12 }]}
              onPress={() => setShowDetails((prev) => !prev)}
            >
              <Text style={styles.outlineBtnText}>
                {showDetails ? "Hide details" : "Show details"}
              </Text>
            </TouchableOpacity>
            {showDetails ? (
              <>
                <Text style={styles.sectionLabel}>Hashes and Metadata</Text>
                <Field label="SHA-256" value={data.sha256} mono small />
                <Field label="pHash" value={data.phash} mono small />
                <Field
                  label="Combined hash"
                  value={data.combinedHashes?.preferred || "-"}
                  mono
                  small
                />
                <Field
                  label="Location summary"
                  value={data.locationSummary || "-"}
                />
                <Field
                  label="Raw coordinates"
                  value={
                    data.gps?.lat != null && data.gps?.lng != null
                      ? `${Number(data.gps.lat).toFixed(4)}, ${Number(data.gps.lng).toFixed(4)}`
                      : "-"
                  }
                  mono
                  small
                />
                <Field label="GPS source" value={data.gpsSource || extractGpsSource(data.metadata)} />
                <Field
                  label="Cell / Wi-Fi derived"
                  value={formatCellDerivedCoordinates(data)}
                  mono
                  small
                />
                <Field
                  label="Radio evidence"
                  value={data.radioEvidenceSummary || summarizeRadioEvidence(data.metadata)}
                />
                <Field
                  label="Anchor storage"
                  value={
                    data.batchAnchor?.source === "solana" ? "Solana + DB" : "DB only"
                  }
                />
                <View style={styles.anchorPayloadBox}>
                  <Text style={styles.proofTitle}>Metadata</Text>
                  <Text style={styles.anchorPayloadText} selectable>
                    {prettyJson(data.metadata)}
                  </Text>
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
                  Merkle and Batch
                </Text>
                <Field
                  label="Batch SHA-256 root"
                  value={data.batchMerkleRoots?.sha256}
                  mono
                  small
                />
                <Field
                  label="Batch pHash root"
                  value={data.batchMerkleRoots?.phash}
                  mono
                  small
                />
                <Field
                  label="Batch TX / signature"
                  value={data.batchAnchor?.txHash || data.chainTxSignature}
                  mono
                  small
                />
                <MerkleTreeSummary
                  label="SHA-256 tree"
                  tree={data.merkleTrees?.sha256}
                />
                <MerkleTreeSummary
                  label="pHash tree"
                  tree={data.merkleTrees?.phash}
                />
                <Field
                  label="Displayed tree"
                  value={data.merkleTreeType === "phash" ? "pHash" : "SHA-256"}
                />
                <Field
                  label="Indexed block"
                  value={
                    data.indexedBlockNumber != null
                      ? String(data.indexedBlockNumber)
                      : "-"
                  }
                  mono
                />
                <Field label="Committed root" value={data.merkleRoot} mono small />
                <Field
                  label="Recomputed root"
                  value={data.computedMerkleRoot}
                  mono
                  small
                />
                <Field label="Serialized leaf" value={data.merkleLeafHash} mono small />
                <Field
                  label="Path length"
                  value={proofList.length ? String(proofList.length) : "-"}
                />
                {proofList.length > 0 ? (
                  <View style={styles.proofBlock}>
                    <Text style={styles.proofTitle}>Sibling hashes</Text>
                    {proofList.map((n, i) => (
                      <Text key={i} style={styles.proofLine} selectable>
                        {i + 1}. {n.position}: {n.hash}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {data.batchAnchor?.payload ? (
                  <View style={styles.anchorPayloadBox}>
                    <Text style={styles.proofTitle}>Solana / DB anchor payload</Text>
                    <Text style={styles.anchorPayloadText} selectable>
                      {prettyJson(data.batchAnchor.payload)}
                    </Text>
                  </View>
                ) : null}
                {data.batchAnchor?.explorerUrl ? (
                  <TouchableOpacity
                    style={[styles.outlineBtn, { marginBottom: 12 }]}
                    onPress={() => Linking.openURL(String(data.batchAnchor?.explorerUrl))}
                  >
                    <Text style={styles.outlineBtnText}>Open Solana Explorer</Text>
                  </TouchableOpacity>
                ) : null}
              </>
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
                <Text style={styles.outlineBtnText}>Verify Merkle Path</Text>
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
                <Text style={styles.outlineBtnText}>Recheck with Server</Text>
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

function prettyJson(value: unknown): string {
  if (value == null) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function summarizeMetadata(value: unknown): string {
  if (!value || typeof value !== "object") return "-";
  const meta = value as Record<string, unknown>;
  const parts: string[] = [];

  const pushIf = (label: string, raw: unknown) => {
    const text = String(raw ?? "").trim();
    if (!text) return;
    parts.push(`${label}: ${text}`);
  };

  pushIf("Device", meta.deviceModel);
  pushIf("Maker", meta.deviceMake);
  pushIf("Software", meta.software);
  pushIf("Captured", meta.dateTimeOriginal || meta.captureTimestamp);
  if (meta.standardizedPhoto && typeof meta.standardizedPhoto === "object") {
    const standardized = meta.standardizedPhoto as Record<string, unknown>;
    const width = Number(standardized.width);
    const height = Number(standardized.height);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      parts.push(`Standard JPG: ${width}x${height}`);
    }
  }

  if (parts.length) return parts.join(" · ");
  const keys = Object.keys(meta);
  return keys.length ? `${keys.length} metadata fields` : "-";
}

function extractGpsSource(value: unknown): string {
  if (!value || typeof value !== "object") return "-";
  const meta = value as Record<string, unknown>;
  const source = String(meta.gpsSource ?? "").trim();
  if (source) return source;
  const hasGps =
    typeof (meta as any).gps?.lat === "number" &&
    typeof (meta as any).gps?.lng === "number";
  if (hasGps) return "Stored GPS";
  const hasFused =
    typeof (meta as any).androidRadioRawSnapshot?.gnss?.fusedLocation?.latitude === "number" &&
    typeof (meta as any).androidRadioRawSnapshot?.gnss?.fusedLocation?.longitude === "number";
  return hasFused ? "Android fused location" : "-";
}

function formatCellDerivedCoordinates(data: VerificationLookupPayload): string {
  const lat = Number(data.cellDerivedGps?.lat);
  const lng = Number(data.cellDerivedGps?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  const centroid = (data.metadata as any)?.serverOpencellidAnalysis?.centroid;
  const metaLat = Number(centroid?.lat);
  const metaLng = Number(centroid?.lng);
  if (Number.isFinite(metaLat) && Number.isFinite(metaLng)) {
    return `${metaLat.toFixed(4)}, ${metaLng.toFixed(4)}`;
  }
  return "-";
}

function summarizeRadioEvidence(value: unknown): string {
  if (!value || typeof value !== "object") return "-";
  const meta = value as Record<string, unknown>;
  const explicit = String(meta.radioEvidenceSummary ?? "").trim();
  if (explicit) return explicit;
  const wifi = Array.isArray((meta as any).androidRadioRawSnapshot?.wifiScan)
    ? (meta as any).androidRadioRawSnapshot.wifiScan.length
    : 0;
  const cell = Array.isArray((meta as any).androidRadioRawSnapshot?.cellScan)
    ? (meta as any).androidRadioRawSnapshot.cellScan.length
    : 0;
  const ble = Array.isArray((meta as any).androidRadioRawSnapshot?.bleBeacons)
    ? (meta as any).androidRadioRawSnapshot.bleBeacons.length
    : 0;
  const parts: string[] = [];
  if (wifi > 0) parts.push(`Wi-Fi ${wifi}`);
  if (cell > 0) parts.push(`Cells ${cell}`);
  if (ble > 0) parts.push(`BLE ${ble}`);
  return parts.length ? parts.join(" · ") : "-";
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
  candidateCard: {
    borderWidth: 1,
    borderColor: ui.borderLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    backgroundColor: ui.canvas,
  },
  candidateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 12,
  },
  candidateSerial: {
    flex: 1,
    color: ui.text,
    fontSize: 14,
    fontWeight: "700",
  },
  candidateScore: {
    color: ui.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  candidateMeta: {
    color: ui.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  candidateHash: {
    color: ui.text,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 4,
  },
  candidateFooter: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  candidateProof: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: "600",
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
  warnSubText: {
    marginTop: 8,
    fontSize: 12,
    color: ui.textSecondary,
    lineHeight: 18,
  },
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
