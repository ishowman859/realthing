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
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VerificationAssetRecord } from "../utils/verityApi";
import { ui } from "../theme/tokens";

interface HistoryScreenProps {
  records: VerificationAssetRecord[];
  loading: boolean;
  onLoadRecords: () => void;
  onBack: () => void;
}

const cardShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      }
    : { elevation: 1 };

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
    <View style={[styles.card, cardShadow]}>
      <View style={styles.cardHeader}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>{index + 1}</Text>
        </View>
        <Text style={styles.dateText}>
          {formatDate(Math.floor(item.createdAt / 1000))}
        </Text>
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>모드</Text>
        <Text style={styles.fieldValue}>{item.mode.toUpperCase()}</Text>
      </View>

      {item.serial ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>시리얼</Text>
          <Text style={styles.fieldValueMono}>{item.serial}</Text>
        </View>
      ) : null}

      {item.onchainTimestampMs ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>온체인 시각</Text>
          <Text style={styles.fieldValue}>
            {new Date(item.onchainTimestampMs).toLocaleString("ko-KR")}
          </Text>
        </View>
      ) : null}

      {item.mode === "sha256" && item.sha256 ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>SHA-256</Text>
          <Text style={styles.fieldValueMono} numberOfLines={2}>
            {item.sha256}
          </Text>
        </View>
      ) : null}

      {item.mode === "phash" && item.phash ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>pHash</Text>
          <Text style={styles.fieldValueMono} numberOfLines={2}>
            {item.phash}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.linkRow}
        onPress={() => openLink(item.verificationUrl)}
        activeOpacity={0.7}
      >
        <Text style={styles.linkText}>검증 페이지</Text>
        <Ionicons name="open-outline" size={18} color={ui.primary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={ui.surface} />
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.iconButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={ui.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>히스토리</Text>
        <TouchableOpacity
          onPress={onLoadRecords}
          style={styles.iconButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="refresh" size={22} color={ui.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={ui.primary} />
          <Text style={styles.loadingText}>불러오는 중…</Text>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="images-outline" size={40} color={ui.textMuted} />
          </View>
          <Text style={styles.emptyText}>등록된 기록이 없어요</Text>
          <Text style={styles.emptySubtext}>
            촬영 후 등록하면 여기에 쌓여요
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
    backgroundColor: ui.canvas,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: ui.surface,
    borderBottomWidth: 1,
    borderBottomColor: ui.borderLight,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    color: ui.text,
    fontSize: 17,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  loadingText: {
    color: ui.textSecondary,
    fontSize: 15,
    marginTop: 8,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: ui.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyText: {
    color: ui.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptySubtext: {
    color: ui.textSecondary,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  list: {
    padding: 20,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: ui.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: ui.borderLight,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: ui.borderLight,
  },
  indexBadge: {
    backgroundColor: ui.primarySoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  indexText: {
    color: ui.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  dateText: {
    color: ui.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  fieldRow: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: ui.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  fieldValue: {
    color: ui.text,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
  },
  fieldValueMono: {
    color: ui.text,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: ui.borderLight,
  },
  linkText: {
    color: ui.primary,
    fontSize: 16,
    fontWeight: "700",
  },
});
