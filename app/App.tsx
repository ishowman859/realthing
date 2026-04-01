import "./src/polyfills";
import React, { useMemo, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/screens/HomeScreen";
import CameraScreen from "./src/screens/CameraScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import VerifyScreen from "./src/screens/VerifyScreen";
import { useVerityHash } from "./src/hooks/useVerityHash";
import { AppErrorBoundary } from "./src/AppErrorBoundary";
import { resolveVerityOwnerAddress } from "./src/utils/verityOwner";

type Screen = "home" | "camera" | "history" | "verify";

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

function AppInner() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");

  const ownerAddress = useMemo(() => resolveVerityOwnerAddress(), []);
  const photoHash = useVerityHash(ownerAddress);

  const handleNavigateCamera = () => {
    setCurrentScreen("camera");
  };

  switch (currentScreen) {
    case "camera":
      return (
        <CameraScreen
          status={photoHash.status}
          statusMessageOverride={photoHash.anchorMonitor.message}
          currentPhash={photoHash.currentPhash}
          currentSha256={photoHash.currentSha256}
          txSignature={photoHash.txSignature}
          verificationUrl={photoHash.verificationUrl}
          qrCodeUrl={photoHash.qrCodeUrl}
          hashMode={photoHash.hashMode}
          error={photoHash.error}
          onRegisterPhoto={photoHash.registerPhoto}
          onReset={photoHash.reset}
          onBack={() => setCurrentScreen("home")}
        />
      );

    case "history":
      return (
        <HistoryScreen
          records={photoHash.records}
          loading={photoHash.loadingRecords}
          onLoadRecords={photoHash.loadRecords}
          onBack={() => setCurrentScreen("home")}
        />
      );

    case "verify":
      return (
        <VerifyScreen
          initialToken=""
          onBack={() => setCurrentScreen("home")}
        />
      );

    default:
      return (
        <HomeScreen
          ownerAddress={ownerAddress}
          anchorStatus={photoHash.anchorMonitor}
          onNavigateCamera={handleNavigateCamera}
          onNavigateHistory={() => setCurrentScreen("history")}
          onNavigateVerify={() => setCurrentScreen("verify")}
        />
      );
  }
}
