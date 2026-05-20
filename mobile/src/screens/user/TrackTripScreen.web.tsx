/**
 * Track Trip Screen - Web Version
 * Real-time bus tracking (maps not available on web)
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
import {
  joinTripRoom,
  leaveTripRoom,
  onTripUpdate,
} from "../../socket/socket";
import { Button, Card, Badge } from "../../components/UIComponents";
import { COLORS, SPACING, STATUS_COLORS, API_ENDPOINTS } from "../../constants/config";
import { formatTime } from "../../utils/helpers";

interface Trip {
  id: number;
  bus_id: number;
  bus_number: string;
  route_name: string;
  status: string;
  current_stop_id?: number;
  current_stop_name?: string;
  next_stop_name?: string;
  stops: Stop[];
  polyline?: string;
  eta_minutes?: number;
}

interface Stop {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  status: "pending" | "approaching" | "arrived" | "departed";
  eta?: string;
  sequence: number;
}

interface TrackTripScreenProps {
  route: any;
  navigation: any;
}

export function TrackTripScreen({ route, navigation }: TrackTripScreenProps) {
  const tripId = route.params?.tripId || route.params?.busId;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch trip details
   */
  const fetchTripDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const api = getApi();
      const response = await api.get(`${API_ENDPOINTS.tripById(tripId)}`);
      const tripData = response.data?.data || response.data;

      setTrip(tripData);

      if (tripData?.bus_id) {
        joinTripRoom(tripData.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load trip";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  /**
   * Listen to trip updates
   */
  useEffect(() => {
    if (!trip?.id) return;

    const unsubscribe = onTripUpdate((data) => {
      if (data?.id === trip.id) {
        setTrip((prev) => (prev ? { ...prev, ...data } : null));
      }
    });

    return unsubscribe;
  }, [trip?.id]);

  /**
   * Fetch trip on mount
   */
  useEffect(() => {
    fetchTripDetails();

    return () => {
      if (trip?.id) {
        leaveTripRoom(trip.id);
      }
    };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading trip details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error || "Trip not found"}</Text>
          <Button
            onPress={() => navigation.goBack()}
            label="Go Back"
            style={styles.backButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const currentStop = trip.stops?.find((s) => s.status === "approaching" || s.status === "arrived");
  const nextStop = trip.stops?.find((s) => s.status === "pending");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>🗺️</Text>
        <Text style={styles.placeholderTitle}>Maps Not Available</Text>
        <Text style={styles.placeholderSubtitle}>
          Real-time bus tracking is available on iOS and Android apps only.
        </Text>
      </View>

      {/* Trip Info */}
      <ScrollView style={styles.infoPanel} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.busNumber}>{trip.bus_number}</Text>
            <Text style={styles.routeName}>{trip.route_name}</Text>
          </View>
          <Badge label={trip.status} variant="primary" />
        </View>

        {/* Current Stop */}
        {currentStop && (
          <Card style={styles.stopCard}>
            <Text style={styles.stopCardTitle}>Current Stop</Text>
            <Text style={styles.stopCardName}>{currentStop.name}</Text>
            <Text style={styles.stopCardStatus}>{currentStop.status}</Text>
          </Card>
        )}

        {/* Next Stop */}
        {nextStop && (
          <Card style={styles.stopCard}>
            <Text style={styles.stopCardTitle}>Next Stop</Text>
            <Text style={styles.stopCardName}>{nextStop.name}</Text>
            {nextStop.eta && (
              <Text style={styles.stopCardEta}>
                ETA: {formatTime(new Date(nextStop.eta))}
              </Text>
            )}
          </Card>
        )}

        {/* All Stops */}
        <Text style={styles.stopsTitle}>Route Stops</Text>
        {trip.stops?.map((stop) => (
          <View
            key={stop.id}
            style={[
              styles.stopListItem,
              { backgroundColor: STATUS_COLORS[stop.status as keyof typeof STATUS_COLORS] || COLORS.gray100 },
            ]}
          >
            <View style={styles.stopListItemNumber}>
              <Text style={styles.stopListItemNumberText}>{stop.sequence}</Text>
            </View>
            <View style={styles.stopListItemInfo}>
              <Text style={styles.stopListItemName}>{stop.name}</Text>
              <Text style={styles.stopListItemStatus}>{stop.status}</Text>
            </View>
            {stop.eta && (
              <Text style={styles.stopListItemEta}>{formatTime(new Date(stop.eta))}</Text>
            )}
          </View>
        ))}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            onPress={() => navigation.goBack()}
            label="Back to Buses"
            style={styles.actionButton}
          />
          <Button
            onPress={fetchTripDetails}
            label="Refresh"
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
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.gray600,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.danger,
    marginBottom: SPACING.lg,
  },
  backButton: {
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
  header: {
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
  stopCard: {
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  stopCardTitle: {
    fontSize: 12,
    color: COLORS.gray500,
    fontWeight: "600",
    marginBottom: SPACING.xs,
  },
  stopCardName: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.gray900,
  },
  stopCardStatus: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: SPACING.xs,
    fontWeight: "600",
  },
  stopCardEta: {
    fontSize: 12,
    color: COLORS.success,
    marginTop: SPACING.xs,
    fontWeight: "600",
  },
  stopsTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.gray900,
    marginVertical: SPACING.md,
  },
  stopListItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  stopListItemNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  stopListItemNumberText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "bold",
  },
  stopListItemInfo: {
    flex: 1,
  },
  stopListItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.gray900,
  },
  stopListItemStatus: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: SPACING.xs,
  },
  stopListItemEta: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.success,
  },
  actions: {
    marginVertical: SPACING.lg,
  },
  actionButton: {
    marginBottom: SPACING.md,
  },
});
