import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: false },
      // Old addresses from before the Practice hub and profile existed.
      { source: "/case-files", destination: "/profile", permanent: false },
      { source: "/courses/:track/:level/:topic/case", destination: "/practice?topic=:track/:level/:topic", permanent: false },
    ];
  },
};

export default nextConfig;
