/**
 * Driver Dashboard Screen - Web Version
 * Shows driver's current trip (maps not available on web)
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { getApi } from "../../services/api";
import { Button, Card, Badge } from "../../components/UIComponents";
import { COLORS, SPACING, API_ENDPOINTS } from "../../constants/config";
import { formatTime } from "../../utils/helpers";

interface DriverTrip {
  id: number;
  bus_id: number;
  bus_number: string;
  route_name: string;
  status: string;
  current_stop_name?: string;
  next_stop_name?: string;
  estimated_time?: string;
}

interface DriverDashboardProps {
  navigation: any;
}

export function DriverDashboardScreen({ navigation }: DriverDashboardProps) {
  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch current trip
   */
  const fetchCurrentTrip = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const api = getApi();
      const response = await api.get(API_ENDPOINTS.driverTrips);
      const trips = response.data?.data || [];

      // Get the first active trip
      const activeTrip = trips.find((t: any) => t.status === "active");
      setTrip(activeTrip || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load trip";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch trip on mount
   */
  useEffect(() => {
    fetchCurrentTrip();
  }, [fetchCurrentTrip]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.noTripText}>No active trip</Text>
          <Button
            onPress={fetchCurrentTrip}
            label="Refresh"
            style={styles.refreshButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Map Placeholder */}
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>📍</Text>
        <Text style={styles.placeholderTitle}>Live Tracking</Text>
        <Text style={styles.placeholderSubtitle}>
          Real-time GPS tracking is available on iOS and Android apps only.
        </Text>
      </View>

      {/* Trip Info */}
      <ScrollView style={styles.infoPanel}>
        {/* Trip Header */}
        <View style={styles.tripHeader}>
          <View>
            <Text style={styles.busNumber}>{trip.bus_number}</Text>
            <Text style={styles.routeName}>{trip.route_name}</Text>
          </View>
          <Badge label={trip.status} variant="primary" />
        </View>

        {/* Trip Details */}
        <Card>
          <Text style={styles.cardTitle}>Current Trip</Text>
          <View style={styles.tripDetail}>
            <Text style={styles.tripDetailLabel}>Current Stop:</Text>
            <Text style={styles.tripDetailValue}>
              {trip.current_stop_name}
            </Text>
          </View>
          <View style={styles.tripDetail}>
            <Text style={styles.tripDetailLabel}>Next Stop:</Text>
            <Text style={styles.tripDetailValue}>{trip.next_stop_name}</Text>
          </View>
          {trip.estimated_time && (
            <View style={styles.tripDetail}>
              <Text style={styles.tripDetailLabel}>Estimated Time:</Text>
              <Text style={styles.tripDetailValue}>
                {trip.estimated_time}
              </Text>
            </View>
          )}
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            onPress={fetchCurrentTrip}
            label="Refresh Trip"
            style={styles.actionButton}
          />
          <Button
            onPress={() => navigation.goBack()}
            label="Back"
            variant="secondary"
            style={styles.actionButton}
          />
        </View>
      </ScrollView>
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
  noTripText: {
    fontSize: 16,
    color: COLORS.gray600,
    marginBottom: SPACING.lg,
  },
  refreshButton: {
    marginTop: SPACING.lg,
  },
  placeholder: {
    height: "40%",
    backgroundColor: COLORS.gray50,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  placeholderText: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.gray900,
    marginBottom: SPACING.sm,
  },
  placeholderSubtitle: {
    fontSize: 14,
    color: COLORS.gray600,
    textAlign: "center",
    paddingHorizontal: SPACING.lg,
  },
  infoPanel: {
    flex: 1,
    padding: SPACING.lg,
  },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  busNumber: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  routeName: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: SPACING.xs,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  tripDetail: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  tripDetailLabel: {
    fontSize: 12,
    color: COLORS.gray500,
    fontWeight: "600",
  },
  tripDetailValue: {
    fontSize: 12,
    color: COLORS.gray700,
    fontWeight: "600",
  },
  actions: {
    marginVertical: SPACING.lg,
  },
  actionButton: {
    marginBottom: SPACING.md,
  },
});
