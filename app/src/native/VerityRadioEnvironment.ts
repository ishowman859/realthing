import { NativeModules, Platform } from "react-native";

export interface RadioEnvironmentLocation {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  provider?: string | null;
}

export interface RadioEnvironmentSnapshot {
  collectionTimeoutMs?: number;
  wifiScan?: Array<Record<string, unknown>>;
  cellScan?: Array<Record<string, unknown>>;
  bleBeacons?: Array<Record<string, unknown>>;
  gnss?: {
    gnssRawSupported?: boolean;
    fusedLocation?: RadioEnvironmentLocation | null;
    gnssMeasurements?: Array<Record<string, unknown>>;
    gnssClock?: Record<string, unknown> | null;
  } | null;
}

type NativeRadioModule = {
  getRadioEnvironmentSnapshot: (timeoutMs: number) => Promise<RadioEnvironmentSnapshot>;
};

const LINK_ERROR =
  "The VerityRadioEnvironment native module is not linked. Rebuild the Android app after prebuild.";

const NativeRadio = NativeModules.VerityRadioEnvironment as NativeRadioModule | undefined;

function requireNative(): NativeRadioModule {
  if (!NativeRadio) {
    throw new Error(LINK_ERROR);
  }
  return NativeRadio;
}

export async function getRadioEnvironmentSnapshot(
  timeoutMs = 2500
): Promise<RadioEnvironmentSnapshot> {
  if (Platform.OS !== "android") {
    return {};
  }
  return requireNative().getRadioEnvironmentSnapshot(timeoutMs);
}
