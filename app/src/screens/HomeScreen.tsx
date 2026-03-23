import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ui } from "../theme/tokens";

interface HomeScreenProps {
  ownerAddress: string;
  onNavigateCamera: () => void;
  onNavigateHistory: () => void;
  onNavigateVerify: () => void;
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
  ownerAddress,
  onNavigateCamera,
  onNavigateHistory,
  onNavigateVerify,
}: HomeScreenProps) {
  const owner = ownerAddress.trim();
  const ownerReady = owner.length > 0;
  const usingFallbackOwner = owner === "demo-owner";
  const ownerShort =
    owner.length > 14 ? `${owner.slice(0, 8)}…${owner.slice(-6)}` : owner;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={ui.canvas} />

      <View style={styles.header}>
        <Text style={styles.logo}>Verity</Text>
        <Text style={styles.subtitle}>사진 원본 증명</Text>
      </View>

      <View style={styles.infoSection}>
        {ownerReady ? (
          <View style={[styles.ownerCard, cardShadow]}>
            <View style={styles.ownerRow}>
              <View style={styles.ownerIconWrap}>
                <Ionicons name="person-circle-outline" size={24} color={ui.primary} />
              </View>
              <View style={styles.ownerTextBlock}>
                <Text style={styles.ownerLabel}>등록 소유자 (API owner)</Text>
                <Text style={styles.ownerValue} selectable>
                  {ownerShort}
                </Text>
              </View>
            </View>
            <Text style={styles.ownerHint}>
              {usingFallbackOwner
                ? "현재는 기본 demo-owner로 동작 중입니다. 실제 서버 owner와 맞추려면 app.json 또는 EXPO_PUBLIC_VERITY_OWNER_ADDRESS를 설정하세요."
                : "지갑 연동은 메인 서버에서 처리합니다. 빌드 설정의 verityOwnerAddress를 서버와 맞춰 주세요."}
            </Text>
          </View>
        ) : (
          <View style={[styles.warnCard, cardShadow]}>
            <Ionicons name="alert-circle-outline" size={22} color={ui.danger} />
            <Text style={styles.warnTitle}>소유자 주소 미설정</Text>
            <Text style={styles.warnBody}>
              app.json의 extra.verityOwnerAddress 또는 환경 변수
              EXPO_PUBLIC_VERITY_OWNER_ADDRESS에 서버에 등록할 owner 문자열을
              넣은 뒤 다시 빌드하세요.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.actionCard,
            cardShadow,
            !ownerReady && styles.actionCardDisabled,
          ]}
          onPress={onNavigateCamera}
          disabled={!ownerReady}
          activeOpacity={0.85}
        >
          <View style={styles.actionIconCircle}>
            <Ionicons
              name="camera"
              size={26}
              color={ownerReady ? ui.primary : ui.textMuted}
            />
          </View>
          <View style={styles.actionTextBlock}>
            <Text
              style={[
                styles.actionTitle,
                !ownerReady && styles.actionTitleDisabled,
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
            color={ownerReady ? ui.textMuted : ui.border}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionCard,
            cardShadow,
            !ownerReady && styles.actionCardDisabled,
          ]}
          onPress={onNavigateHistory}
          disabled={!ownerReady}
          activeOpacity={0.85}
        >
          <View style={[styles.actionIconCircle, styles.actionIconCircleAlt]}>
            <Ionicons
              name="time-outline"
              size={26}
              color={ownerReady ? ui.success : ui.textMuted}
            />
          </View>
          <View style={styles.actionTextBlock}>
            <Text
              style={[
                styles.actionTitle,
                !ownerReady && styles.actionTitleDisabled,
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
            color={ownerReady ? ui.textMuted : ui.border}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, cardShadow]}
          onPress={onNavigateVerify}
          activeOpacity={0.85}
        >
          <View style={[styles.actionIconCircle, styles.actionIconCircleVerify]}>
            <Ionicons name="shield-checkmark-outline" size={26} color={ui.primary} />
          </View>
          <View style={styles.actionTextBlock}>
            <Text style={styles.actionTitle}>검증 조회</Text>
            <Text style={styles.actionDesc}>
              토큰으로 머클·해시 결과 조회 (소유자 설정 불필요)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={ui.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Verity</Text>
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
  infoSection: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  ownerCard: {
    backgroundColor: ui.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: ui.borderLight,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ownerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: ui.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  ownerTextBlock: { flex: 1 },
  ownerLabel: {
    fontSize: 12,
    color: ui.textSecondary,
    fontWeight: "600",
    marginBottom: 4,
  },
  ownerValue: {
    fontSize: 15,
    color: ui.text,
    fontWeight: "700",
  },
  ownerHint: {
    marginTop: 14,
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 19,
  },
  warnCard: {
    backgroundColor: ui.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: ui.borderLight,
    gap: 8,
  },
  warnTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: ui.text,
  },
  warnBody: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 19,
    marginTop: 4,
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
  actionIconCircleVerify: {
    backgroundColor: ui.primarySoft,
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
