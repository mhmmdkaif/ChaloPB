import React, { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { ActivityIndicator, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { SignupScreen } from "../screens/auth/SignupScreen";
import { SplashScreen } from "../screens/auth/SplashScreen";
import { UserDashboardScreen } from "../screens/user/UserDashboardScreen";
import { TrackTripScreen } from "../screens/user/TrackTripScreen";
import { DriverDashboardScreen } from "../screens/driver/DriverDashboardScreen";
import { DriverHistoryScreen } from "../screens/driver/DriverHistoryScreen";
import {
  AdminDashboardScreen,
  AdminBusesScreen,
  AdminDriversScreen,
  AdminTripsScreen,
} from "../screens/admin/AdminScreens";
import { COLORS } from "../constants/config";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

function UserTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray400,
        tabBarStyle: {
          borderTopColor: COLORS.gray100,
          elevation: 8,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="Search"
        component={UserDashboardScreen}
        options={{
          title: "Buses",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bus" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function UserStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="UserTabs" component={UserTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="TrackTrip"
        component={TrackTripScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function DriverStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="DriverDashboard"
        component={DriverDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DriverHistory"
        component={DriverHistoryScreen}
        options={{
          title: "Trip History",
          headerStyle: { backgroundColor: COLORS.white },
          headerTintColor: COLORS.primary,
          headerTitleStyle: { fontWeight: "800" },
        }}
      />
    </Stack.Navigator>
  );
}

function AdminStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AdminBuses"
        component={AdminBusesScreen}
        options={{ title: "Buses" }}
      />
      <Stack.Screen
        name="AdminDrivers"
        component={AdminDriversScreen}
        options={{ title: "Drivers" }}
      />
      <Stack.Screen
        name="AdminTrips"
        component={AdminTripsScreen}
        options={{ title: "Trips" }}
      />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  // Show the branded launch screen on every cold app start.
  if (showSplash && !loading) {
    return (
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animationTypeForReplace: "pop",
          }}
        >
          <Stack.Screen
            name="Splash"
            options={{ headerShown: false }}
          >
            {(props) => (
              <SplashScreen onComplete={handleSplashComplete} />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: COLORS.background,
        }}
      >
        <Text
          style={{
            fontSize: 32,
            fontWeight: "900",
            color: COLORS.white,
            letterSpacing: 2,
            marginBottom: 20,
          }}
        >
          ChaloPB
        </Text>
        <ActivityIndicator size="large" color={COLORS.glow} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthStack />
      ) : user.role === "driver" ? (
        <DriverStack />
      ) : user.role === "admin" ? (
        <AdminStack />
      ) : (
        <UserStack />
      )}
    </NavigationContainer>
  );
}
