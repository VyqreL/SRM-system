import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {

  allowedDevOrigins: ['127.0.0.1', 'localhost', 'http://localhost:3000'],

  webpack: (config) => {
    config.watchOptions = {
      poll: 1000,   // Перевіряти зміни кожну секунду
      aggregateTimeout: 300,
    };
    return config;
  },
};

export default nextConfig;
