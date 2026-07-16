import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const localDevOrigins = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter((entry) => !entry.internal)
  .flatMap((entry) => {
    const address = entry.address.split("%")[0];
    return entry.family === "IPv6" ? [address, `[${address}]`] : [address];
  });

const configuredDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  turbopack: {},
  allowedDevOrigins: [...new Set(["localhost", "127.0.0.1", ...localDevOrigins, ...configuredDevOrigins])],
};

export default nextConfig;
