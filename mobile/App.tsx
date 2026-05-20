/**
 * App.tsx - ChaloPB Mobile App Entry Point
 */

import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View, Text, StyleSheet } from "react-native";

import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { initializeApi } from "./src/services/api";
import { initializeSocket, disconnectSocket } from "./src/socket/socket";
import { useAuth } from "./src/context/AuthContext";
import { COLORS } from "./src/constants/config";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={eb.container}>
          <Text style={eb.title}>Something went wrong</Text>
          <Text style={eb.message}>{this.state.error?.message || "Unexpected error"}</Text>
        </View>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: COLORS.white },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.danger, marginBottom: 12 },
  message: { fontSize: 14, color: COLORS.gray600, textAlign: "center" },
});

function AppContent() {
  const { user } = useAuth();

  useEffect(() => {
    try {
      initializeApi();
    } catch (err) {
      console.error("[App] initializeApi failed:", err);
    }
  }, []);

  useEffect(() => {
    if (user?.token) {
      try {
        initializeSocket(user.token);
      } catch (err) {
        console.error("[App] initializeSocket failed:", err);
      }
    } else {
      try {
        disconnectSocket();
      } catch (err) {
        console.error("[App] disconnectSocket failed:", err);
      }
    }
  }, [user?.token]);

  return (
    <>
      <StatusBar style="light" backgroundColor="#061650" />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
