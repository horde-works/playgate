import type { NextConfig } from "next";

const isFirebaseStaticExport = process.env.FIREBASE_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isFirebaseStaticExport ? "export" : undefined,
  typescript: isFirebaseStaticExport
    ? { tsconfigPath: "tsconfig.firebase.json" }
    : undefined,
};

export default nextConfig;
