import React, { Component, type ErrorInfo, type ReactNode } from "react";
import {
  Platform,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from "react-native";

type Props = { children: ReactNode };
type State = { err: Error | null };

/**
 * JS 런타임 예외 시 즉시 종료 대신 메시지 표시 (릴리스 디버깅용).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(e: Error): State {
    return { err: e };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.err) {
      const e = this.state.err;
      return (
        <SafeAreaView style={styles.wrap}>
          <Text style={styles.title}>App error</Text>
          <Text style={styles.hint}>
            Capture the details below if you need to report the issue.
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner}>
            <Text selectable style={styles.mono}>
              {e.message}
            </Text>
            {e.stack ? (
              <Text selectable style={styles.stack}>
                {e.stack}
              </Text>
            ) : null}
          </ScrollView>
          <Pressable
            style={styles.btn}
            onPress={() => this.setState({ err: null })}
          >
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F2F4F6", padding: 20 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#191F28",
    marginBottom: 8,
  },
  hint: { fontSize: 14, color: "#6B7684", marginBottom: 16 },
  scroll: { flex: 1, marginBottom: 16 },
  scrollInner: { paddingBottom: 24 },
  mono: {
    fontSize: 14,
    color: "#191F28",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  stack: {
    marginTop: 12,
    fontSize: 11,
    color: "#64748b",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  btn: {
    backgroundColor: "#3182F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
