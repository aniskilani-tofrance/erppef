import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Racine explicite : un package-lock.json parasite dans le home dir fausse l'inférence
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
