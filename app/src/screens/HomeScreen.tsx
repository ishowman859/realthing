import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ui } from "../theme/tokens";

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

const cardShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      }
    : { elevation: 2 };

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
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={ui.canvas} />

      <View style={styles.header}>
        <Text style={styles.logo}>Verity</Text>
        <Text style={styles.subtitle}>사진 원본 증명 · Solana</Text>
      </View>

      <View style={styles.walletSection}>
        {connected ? (
          <View style={[styles.walletCard, cardShadow]}>
            <View style={styles.walletRow}>
              <View style={styles.walletIconWrap}>
                <Ionicons name="wallet" size={22} color={ui.primary} />
              </View>
              <Text style={styles.walletAddress}>{shortAddress}</Text>
            </View>
            <Text style={styles.balanceLabel}>잔액</Text>
            <Text style={styles.balanceValue}>{balance.toFixed(4)} SOL</Text>
            <TouchableOpacity
              style={styles.textButton}
              onPress={onDisconnect}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            >
              <Text style={styles.disconnectText}>연결 해제</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.connectButton, cardShadow]}
            onPress={onConnect}
            disabled={connecting}
            activeOpacity={0.88}
          >
            {connecting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={22} color="#FFFFFF" />
                <Text style={styles.connectText}>지갑 연결</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.actionCard,
            cardShadow,
            !connected && styles.actionCardDisabled,
          ]}
          onPress={onNavigateCamera}
          disabled={!connected}
          activeOpacity={0.85}
        >
          <View style={styles.actionIconCircle}>
            <Ionicons
              name="camera"
              size={26}
              color={connected ? ui.primary : ui.textMuted}
            />
          </View>
          <View style={styles.actionTextBlock}>
            <Text
              style={[
                styles.actionTitle,
                !connected && styles.actionTitleDisabled,
              ]}
            >
              사진 촬영 & 등록
            </Text>
            <Text style={styles.actionDesc}>
              온디바이스 1차 필터 후 SHA-256 · pHash 선택
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={connected ? ui.textMuted : ui.border}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionCard,
            cardShadow,
            !connected && styles.actionCardDisabled,
          ]}
          onPress={onNavigateHistory}
          disabled={!connected}
          activeOpacity={0.85}
        >
          <View style={[styles.actionIconCircle, styles.actionIconCircleAlt]}>
            <Ionicons
              name="time-outline"
              size={26}
              color={connected ? ui.success : ui.textMuted}
            />
          </View>
          <View style={styles.actionTextBlock}>
            <Text
              style={[
                styles.actionTitle,
                !connected && styles.actionTitleDisabled,
              ]}
            >
              등록 히스토리
            </Text>
            <Text style={styles.actionDesc}>
              검증 URL · QR이 포함된 기록
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={connected ? ui.textMuted : ui.border}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Verity · SVM</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ui.canvas,
  },
  header: {
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 28,
  },
  logo: {
    fontSize: 34,
    fontWeight: "800",
    color: ui.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: ui.textSecondary,
    marginTop: 8,
    fontWeight: "500",
  },
  walletSection: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  walletCard: {
    backgroundColor: ui.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: ui.borderLight,
  },
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  walletIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: ui.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  walletAddress: {
    flex: 1,
    fontSize: 16,
    color: ui.text,
    fontWeight: "600",
  },
  balanceLabel: {
    fontSize: 13,
    color: ui.textSecondary,
    marginTop: 18,
    fontWeight: "500",
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: "700",
    color: ui.text,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  textButton: {
    alignSelf: "flex-start",
    marginTop: 16,
  },
  disconnectText: {
    color: ui.danger,
    fontSize: 15,
    fontWeight: "600",
  },
  connectButton: {
    backgroundColor: ui.primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  connectText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actions: {
    paddingHorizontal: 20,
    gap: 12,
  },
  actionCard: {
    backgroundColor: ui.surface,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: ui.borderLight,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  actionCardDisabled: {
    opacity: 0.45,
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: ui.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconCircleAlt: {
    backgroundColor: ui.successSoft,
  },
  actionTextBlock: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: ui.text,
    marginBottom: 4,
  },
  actionTitleDisabled: {
    color: ui.textMuted,
  },
  actionDesc: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    fontWeight: "400",
  },
  footer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 20,
  },
  footerText: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
});
