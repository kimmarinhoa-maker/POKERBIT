import type { NextConfig } from 'next';
import path from 'path';

// Railway/Vercel: set NEXT_PUBLIC_API_BACKEND_URL to the API service URL
const API_BACKEND_URL = process.env.NEXT_PUBLIC_API_BACKEND_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output for Railway/Docker container deployment
  output: 'standalone',
  // Monorepo: tell Next.js the root is two levels up
  outputFileTracingRoot: path.join(__dirname, '../../'),
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
