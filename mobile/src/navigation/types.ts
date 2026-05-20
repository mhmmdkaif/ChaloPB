import { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  SplashScreen: undefined;
  UserTabs: undefined;
  Search: undefined;
  TrackTrip: { tripId: number };
  DriverDashboard: undefined;
  DriverHistory: undefined;
  AdminDashboard: undefined;
  AdminBuses: undefined;
  AdminDrivers: undefined;
  AdminTrips: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
