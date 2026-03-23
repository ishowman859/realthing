import "./src/polyfills";
import React, { useState } from "react";
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/screens/HomeScreen";
import CameraScreen from "./src/screens/CameraScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import { useWallet } from "./src/hooks/useWallet";
import { useVerityHash } from "./src/hooks/useVerityHash";
import { AppErrorBoundary } from "./src/AppErrorBoundary";

type Screen = "home" | "camera" | "history";

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

  const wallet = useWallet();

  const photoHash = useVerityHash(
    wallet.publicKey,
    wallet.signAndSendTransaction
  );

  const handleConnect = async () => {
    try {
      await wallet.connect();
    } catch {
      Alert.alert(
        "연결 실패",
        "지갑 연결에 실패했습니다. Phantom 앱이 설치되어 있는지 확인해주세요."
      );
    }
  };

  const handleNavigateCamera = () => {
    photoHash.reset();
    setCurrentScreen("camera");
  };

  switch (currentScreen) {
    case "camera":
      return (
        <CameraScreen
          status={photoHash.status}
          currentPhash={photoHash.currentPhash}
          currentSha256={photoHash.currentSha256}
          txSignature={photoHash.txSignature}
          verificationUrl={photoHash.verificationUrl}
          qrCodeUrl={photoHash.qrCodeUrl}
          hashMode={photoHash.hashMode}
          error={photoHash.error}
          onRegisterPhoto={photoHash.registerPhoto}
          onReset={photoHash.reset}
          onBack={() => {
            photoHash.reset();
            setCurrentScreen("home");
          }}
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

    default:
      return (
        <HomeScreen
          connected={wallet.connected}
          connecting={wallet.connecting}
          address={wallet.address}
          balance={wallet.balance}
          onConnect={handleConnect}
          onDisconnect={wallet.disconnect}
          onNavigateCamera={handleNavigateCamera}
          onNavigateHistory={() => setCurrentScreen("history")}
        />
      );
  }
}
