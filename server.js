import express from "express";
import "dotenv/config";

import { redis, connectRedis } from "./redis.js";
import { rateLimiter } from "./rateLimiter.js";

const app = express();

app.use(express.json());

app.get(
  "/api/data",
  rateLimiter({
    limit: 5,
    windowMs: 60_000,
  }),
  (req, res) => {
    res.json({
      message: "Request successful",
      timestamp: new Date().toISOString(),
    });
  },
);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "Internal server error",
  });
});

const port = Number(process.env.PORT) || 3000;

await connectRedis();

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    try {
      await redis.quit();
    } catch (error) {
      console.error("Redis shutdown error:", error);
    }

    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
