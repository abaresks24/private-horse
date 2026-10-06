/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // snarkjs / circomlibjs need these shims in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, readline: false };
    return config;
  },
};
module.exports = nextConfig;
