import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface HomeScreenProps {
  connected: boolean;
  connecting: boolean;
  address: string | null;
  balance: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onNavigateCamera: () => void;
  onNavigateHistory: () => void;
}

export default function HomeScreen({
  connected,
  connecting,
  address,
  balance,
  onConnect,
  onDisconnect,
  onNavigateCamera,
  onNavigateHistory,
}: HomeScreenProps) {
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.logo}>Verity</Text>
        <Text style={styles.subtitle}>사진 원본 증명 on Solana</Text>
      </View>

      <View style={styles.walletSection}>
        {connected ? (
          <View style={styles.walletInfo}>
            <View style={styles.walletBadge}>
              <Ionicons name="wallet" size={20} color="#14f195" />
              <Text style={styles.walletAddress}>{shortAddress}</Text>
            </View>
            <Text style={styles.balanceText}>
              {balance.toFixed(4)} VRT
            </Text>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={onDisconnect}
            >
              <Text style={styles.disconnectText}>연결 해제</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={onConnect}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#0f0f23" />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={24} color="#0f0f23" />
                <Text style={styles.connectText}>지갑 연결</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionCard, !connected && styles.actionCardDisabled]}
          onPress={onNavigateCamera}
          disabled={!connected}
        >
          <View style={styles.actionIconContainer}>
            <Ionicons
              name="camera"
              size={36}
              color={connected ? "#9945ff" : "#555"}
            />
          </View>
          <Text
            style={[
              styles.actionTitle,
              !connected && styles.actionTitleDisabled,
            ]}
          >
            사진 촬영 & 등록
          </Text>
          <Text style={styles.actionDesc}>
            온디바이스 AI 1차 필터 → SHA-256 / pHash 선택 등록
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, !connected && styles.actionCardDisabled]}
          onPress={onNavigateHistory}
          disabled={!connected}
        >
          <View style={styles.actionIconContainer}>
            <Ionicons
              name="time"
              size={36}
              color={connected ? "#14f195" : "#555"}
            />
          </View>
          <Text
            style={[
              styles.actionTitle,
              !connected && styles.actionTitleDisabled,
            ]}
          >
            등록 히스토리
          </Text>
          <Text style={styles.actionDesc}>
            검증 URL / QR이 포함된 인증 히스토리 조회
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by Verity Chain (SVM)</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f23",
  },
  header: {
    alignItems: "center",
    paddingTop: 48,
    paddingBottom: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    marginTop: 8,
  },
  walletSection: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  walletInfo: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#14f195",
  },
  walletBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  walletAddress: {
    fontSize: 16,
    color: "#14f195",
    fontFamily: "monospace",
  },
  balanceText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 12,
  },
  disconnectButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  disconnectText: {
    color: "#ff6b6b",
    fontSize: 13,
  },
  connectButton: {
    backgroundColor: "#14f195",
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  connectText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f0f23",
  },
  actions: {
    paddingHorizontal: 24,
    gap: 16,
  },
  actionCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  actionCardDisabled: {
    opacity: 0.4,
  },
  actionIconContainer: {
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 6,
  },
  actionTitleDisabled: {
    color: "#555",
  },
  actionDesc: {
    fontSize: 13,
    color: "#888",
    lineHeight: 18,
  },
  footer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 24,
  },
  footerText: {
    color: "#444",
    fontSize: 12,
  },
});
