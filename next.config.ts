import type { NextConfig } from "next";
import path from "node:path";
import { SIGNUP_FRAME_CSP } from "./src/lib/inscription/embed";

const nextConfig: NextConfig = {
  // Racine explicite : un package-lock.json parasite dans le home dir fausse l'inférence
  turbopack: {
    root: path.join(__dirname),
  },
  // Inscription rapide intégrable dans le site parleremploiformation.pro (iframe) :
  // seuls le site et Lovable peuvent l'afficher dans un cadre.
  async headers() {
    return ["/inscription", "/inscription/:path*"].map((source) => ({
      source,
      headers: [{ key: "Content-Security-Policy", value: SIGNUP_FRAME_CSP }],
    }));
  },
};

export default nextConfig;
