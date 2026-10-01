import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: false },
      // Old addresses: the case-files page became the profile, and topic case pages were removed.
      { source: "/case-files", destination: "/profile", permanent: false },
      { source: "/courses/:track/:level/:topic/case", destination: "/courses/:track/:level/:topic", permanent: false },
    ];
  },
};

export default nextConfig;
