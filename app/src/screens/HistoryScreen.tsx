import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VerificationAssetRecord } from "../utils/verityApi";

interface HistoryScreenProps {
  records: VerificationAssetRecord[];
  loading: boolean;
  onLoadRecords: () => void;
  onBack: () => void;
}

export default function HistoryScreen({
  records,
  loading,
  onLoadRecords,
  onBack,
}: HistoryScreenProps) {
  useEffect(() => {
    onLoadRecords();
  }, [onLoadRecords]);

  const openLink = (url: string) => Linking.openURL(url);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: VerificationAssetRecord;
    index: number;
  }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>#{index + 1}</Text>
        </View>
        <Text style={styles.dateText}>{formatDate(Math.floor(item.createdAt / 1000))}</Text>
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Mode</Text>
        <Text style={styles.fieldValue}>{item.mode.toUpperCase()}</Text>
      </View>

      {item.serial ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Serial</Text>
          <Text style={styles.fieldValue}>{item.serial}</Text>
        </View>
      ) : null}

      {item.onchainTimestampMs ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Onchain Timestamp</Text>
          <Text style={styles.fieldValue}>
            {new Date(item.onchainTimestampMs).toLocaleString("ko-KR")}
          </Text>
        </View>
      ) : null}

      {item.mode === "sha256" && item.sha256 ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>SHA-256</Text>
          <Text style={styles.fieldValue} numberOfLines={2}>
            {item.sha256}
          </Text>
        </View>
      ) : null}

      {item.mode === "phash" && item.phash ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>pHash</Text>
          <Text style={styles.fieldValue} numberOfLines={2}>
            {item.phash}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.explorerButton}
        onPress={() => openLink(item.verificationUrl)}
      >
        <Ionicons name="open-outline" size={14} color="#9945ff" />
        <Text style={styles.explorerText}>검증 페이지 열기</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>등록 히스토리</Text>
        <TouchableOpacity onPress={onLoadRecords}>
          <Ionicons name="refresh" size={24} color="#14f195" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#9945ff" />
          <Text style={styles.loadingText}>온체인 데이터 조회 중...</Text>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="images-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>아직 등록된 사진이 없습니다</Text>
          <Text style={styles.emptySubtext}>
            카메라로 사진을 촬영하고 블록체인에 등록해보세요
          </Text>
        </View>
      ) : (
        <FlatList
          data={records}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f23",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topBarTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
  },
  emptyText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    color: "#444",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  list: {
    padding: 20,
    gap: 16,
  },
  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#2a2a4a",
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  indexBadge: {
    backgroundColor: "#9945ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  indexText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  dateText: {
    color: "#888",
    fontSize: 12,
  },
  fieldRow: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: "#9945ff",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  fieldValue: {
    color: "#14f195",
    fontSize: 14,
    fontFamily: "monospace",
  },
  explorerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingVertical: 8,
  },
  explorerText: {
    color: "#9945ff",
    fontSize: 13,
    fontWeight: "500",
  },
});
