/**
 * Admin screens
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Button, Card, Badge } from "../../components/UIComponents";
import { getApi } from "../../services/api";
import { COLORS, SPACING, API_ENDPOINTS } from "../../constants/config";
import type { RootStackScreenProps } from "../../navigation/types";

export function AdminDashboardScreen({ navigation }: RootStackScreenProps<'AdminDashboard'>) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const api = getApi();
        const response = await api.get(API_ENDPOINTS.adminDashboard);
        setStats(response.data?.data || {});
      } catch (err) {
        console.error("[Admin] Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Admin Dashboard</Text>

        {/* Stats */}
        <Card>
          <Text style={styles.cardTitle}>Fleet Overview</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Buses:</Text>
            <Text style={styles.statValue}>{stats?.totalBuses || 0}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Active Trips:</Text>
            <Text style={styles.statValue}>{stats?.activeTrips || 0}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Online Drivers:</Text>
            <Text style={styles.statValue}>{stats?.onlineDrivers || 0}</Text>
          </View>
        </Card>

        {/* Navigation */}
        <Button
          onPress={() => navigation.navigate("AdminBuses")}
          label="🚌 Manage Buses"
          style={styles.button}
        />
        <Button
          onPress={() => navigation.navigate("AdminDrivers")}
          label="👤 Manage Drivers"
          variant="secondary"
          style={styles.button}
        />
        <Button
          onPress={() => navigation.navigate("AdminTrips")}
          label="📋 Manage Trips"
          variant="secondary"
          style={styles.button}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

export function AdminBusesScreen({ navigation }: RootStackScreenProps<'AdminBuses'>) {
  const [buses, setBuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBuses = async () => {
      try {
        const api = getApi();
        const response = await api.get(API_ENDPOINTS.adminBuses);
        setBuses(response.data?.data || []);
      } catch (err) {
        console.error("[Admin] Failed to fetch buses:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBuses();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={buses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.itemHeader}>
              <Text style={styles.busNumber}>{item.bus_number}</Text>
              <Badge label={item.status || "inactive"} />
            </View>
            <Text style={styles.itemSubtitle}>
              Driver: {item.driver_name || "Unassigned"}
            </Text>
          </Card>
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<Text style={styles.title}>Buses</Text>}
      />
    </SafeAreaView>
  );
}

export function AdminDriversScreen({ navigation }: RootStackScreenProps<'AdminDrivers'>) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const api = getApi();
        const response = await api.get(API_ENDPOINTS.adminDrivers);
        setDrivers(response.data?.data || []);
      } catch (err) {
        console.error("[Admin] Failed to fetch drivers:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDrivers();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={drivers}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.itemHeader}>
              <Text style={styles.driverName}>{item.name}</Text>
              <Badge label={item.status || "offline"} />
            </View>
            <Text style={styles.itemSubtitle}>{item.email}</Text>
          </Card>
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<Text style={styles.title}>Drivers</Text>}
      />
    </SafeAreaView>
  );
}

export function AdminTripsScreen({ navigation }: RootStackScreenProps<'AdminTrips'>) {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const api = getApi();
        const response = await api.get(API_ENDPOINTS.adminTrips);
        setTrips(response.data?.data || []);
      } catch (err) {
        console.error("[Admin] Failed to fetch trips:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.itemHeader}>
              <Text style={styles.routeName}>{item.route_name}</Text>
              <Badge label={item.status || "pending"} />
            </View>
            <Text style={styles.itemSubtitle}>{item.bus_number}</Text>
          </Card>
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<Text style={styles.title}>Trips</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: SPACING.lg,
  },
  listContent: {
    padding: SPACING.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.gray900,
    marginBottom: SPACING.lg,
  },
  card: {
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: SPACING.md,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.gray600,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  button: {
    marginTop: SPACING.md,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  busNumber: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.gray900,
  },
  routeName: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  itemSubtitle: {
    fontSize: 12,
    color: COLORS.gray500,
  },
});
