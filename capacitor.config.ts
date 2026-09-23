import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.mibale",
  appName: "mibale",
  webDir: "dist/client",
  server: {
    androidScheme: "https",
    hostname: "mibale.app",
  },
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#f8fafc" },
  },
};

export default config;
