import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  Image,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ui } from "../theme/tokens";
import { AnchorMonitorState } from "../hooks/useVerityHash";

const logoImage = require("../../assets/logo.jpg");

interface HomeScreenProps {
  ownerAddress: string;
  anchorStatus: AnchorMonitorState;
  onNavigateCamera: () => void;
  onNavigateHistory: () => void;
  onNavigateVerify: () => void;
}

const cardShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
      }
    : { elevation: 2 };

function ActionCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionCard, cardShadow]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={24} color={ui.primary} />
      </View>
      <View style={styles.actionTextBlock}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDesc}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={ui.textMuted} />
    </TouchableOpacity>
  );
}

export default function HomeScreen({
  anchorStatus,
  onNavigateCamera,
  onNavigateHistory,
  onNavigateVerify,
}: HomeScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={ui.canvas} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.logoShell, cardShadow]}>
            <Image source={logoImage} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.brand}>Verity</Text>
          <Text style={styles.tagline}>
            Capture, anchor, and verify media with SHA-256, pHash, and Merkle proofs.
          </Text>
        </View>

        {anchorStatus.status !== "idle" && anchorStatus.message ? (
          <View
            style={[
              styles.statusCard,
              anchorStatus.status === "anchored"
                ? styles.statusCardSuccess
                : styles.statusCardPending,
              cardShadow,
            ]}
          >
            <Text style={styles.statusTitle}>
              {anchorStatus.status === "anchored"
                ? "Latest batch anchored"
                : "Batch processing"}
            </Text>
            <Text style={styles.statusBody}>{anchorStatus.message}</Text>
            {anchorStatus.serial ? (
              <Text style={styles.statusMeta}>Serial: {anchorStatus.serial}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <ActionCard
            icon="camera"
            title="Capture"
            description="Take a photo or record a video and register it automatically."
            onPress={onNavigateCamera}
          />
          <ActionCard
            icon="shield-checkmark-outline"
            title="Verify"
            description="Check an existing record with hashes, Merkle proof, and metadata."
            onPress={onNavigateVerify}
          />
          <ActionCard
            icon="time-outline"
            title="History"
            description="Review registered items and open their verification pages."
            onPress={onNavigateHistory}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ui.canvas,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  hero: {
    alignItems: "center",
    paddingTop: 18,
    paddingBottom: 28,
  },
  logoShell: {
    width: 148,
    height: 148,
    borderRadius: 36,
    backgroundColor: ui.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    padding: 18,
  },
  logoImage: {
    width: 112,
    height: 112,
  },
  brand: {
    fontSize: 34,
    fontWeight: "800",
    color: ui.text,
    letterSpacing: -0.7,
  },
  tagline: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: ui.textSecondary,
    textAlign: "center",
    maxWidth: 300,
  },
  statusCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusCardPending: {
    backgroundColor: ui.warningSoft,
    borderColor: ui.warning,
  },
  statusCardSuccess: {
    backgroundColor: ui.successSoft,
    borderColor: ui.success,
  },
  statusTitle: {
    color: ui.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },
  statusBody: {
    color: ui.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  statusMeta: {
    marginTop: 8,
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    gap: 14,
    marginTop: 10,
  },
  actionCard: {
    backgroundColor: ui.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: ui.borderLight,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: ui.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTextBlock: {
    flex: 1,
  },
  actionTitle: {
    color: ui.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  actionDesc: {
    color: ui.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
