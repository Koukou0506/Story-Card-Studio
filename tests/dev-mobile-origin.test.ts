import { networkInterfaces } from "node:os";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("mobile development access", () => {
  it("allows the machine LAN addresses that phones use to load Next.js client resources", () => {
    const localAddresses = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => !entry.internal)
      .map((entry) => entry.address.split("%")[0]);

    expect(localAddresses.length).toBeGreaterThan(0);
    expect(nextConfig.allowedDevOrigins).toEqual(expect.arrayContaining(localAddresses));
  });
});
