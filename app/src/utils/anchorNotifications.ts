import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const ANCHOR_CHANNEL_ID = "anchor-status";

let initialized = false;

export async function ensureAnchorNotificationSetup(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANCHOR_CHANNEL_ID, {
      name: "Verity Anchor Status",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function requestAnchorNotificationPermission(): Promise<boolean> {
  await ensureAnchorNotificationSetup();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function sendAnchorCompletedNotification(input: {
  serial?: string | null;
  verificationUrl?: string | null;
}): Promise<void> {
  const granted = await requestAnchorNotificationPermission();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Verity batch anchor complete",
      body: input.serial
        ? `${input.serial} has been included in an on-chain batch.`
        : "Your registration has been included in an on-chain batch.",
      data: {
        verificationUrl: input.verificationUrl || null,
      },
    },
    trigger: null,
  });
}
