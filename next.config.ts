import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/setup": ["./drizzle/*.sql", "./drizzle/meta/_journal.json"],
    "/api/settings": ["./drizzle/*.sql", "./drizzle/meta/_journal.json"],
  },
  outputFileTracingExcludes: { "/*": ["./.gasoline/**"] },
  turbopack: {
    rules: {
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
