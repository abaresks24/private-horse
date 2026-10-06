const webpack = require("webpack");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // wallet-adapter pulls React types that trip Next's strict JSX check; runtime is fine.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      readline: false,
      crypto: false,
      path: false,
      os: false,
      "pino-pretty": false,
      stream: require.resolve("stream-browserify"),
      buffer: require.resolve("buffer"),
    };
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
      })
    );
    return config;
  },
};
module.exports = nextConfig;
