import type { NextConfig } from 'next';

const API_BACKEND_URL = process.env.NEXT_PUBLIC_API_BACKEND_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
