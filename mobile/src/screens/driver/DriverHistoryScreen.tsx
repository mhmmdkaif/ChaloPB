import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { getApi } from "../../services/api";
import { COLORS, SPACING, BORDER_RADIUS } from "../../constants/config";
import type { RootStackScreenProps } from "../../navigation/types";

interface TripRecord {
  id: number;
  bus_number: string;
  route_name: string;
  started_at?: string;
  ended_at?: string;
  status: string;
  duration?: string;
}

export function DriverHistoryScreen({ navigation }: RootStackScreenProps<'DriverHistory'>) {
  const [history, setHistory] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const api = getApi();
      const res = await api.get("/drivers/me/trips");
      const data = res.data?.data || res.data || [];
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      // fallback to empty
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={history}
        keyExtractor={(i) => String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Text style={styles.title}>📋 Trip History</Text>
        }
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗂️</Text>
            <Text style={styles.emptyText}>No trips yet</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.busTag}>
                <Text style={styles.busTagText}>🚌 {item.bus_number}</Text>
              </View>
              <View style={[styles.statusBadge, item.status === "completed" ? styles.statusCompleted : styles.statusPending]}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.routeName}>{item.route_name}</Text>
            <View style={styles.dateRow}>
              <Text style={styles.dateText}>📅 {formatDate(item.started_at)}</Text>
              {item.duration && <Text style={styles.durationText}>⏱ {item.duration}</Text>}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: SPACING.lg },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.gray900, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: SPACING.sm },
  busTag: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  busTagText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  statusCompleted: { backgroundColor: "#dcfce7" },
  statusPending: { backgroundColor: COLORS.gray100 },
  statusText: { fontSize: 12, fontWeight: "700", color: COLORS.gray700 },
  routeName: { fontSize: 15, fontWeight: "600", color: COLORS.gray800, marginBottom: SPACING.sm },
  dateRow: { flexDirection: "row", justifyContent: "space-between" },
  dateText: { fontSize: 12, color: COLORS.gray500 },
  durationText: { fontSize: 12, color: COLORS.gray500 },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: SPACING.md },
  emptyText: { fontSize: 15, color: COLORS.gray500, fontWeight: "600" },
});

export default DriverHistoryScreen;
