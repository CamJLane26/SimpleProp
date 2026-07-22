import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";

const { Pool } = pg;

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://simpleprop:simpleprop@localhost:5433/simpleprop";

const pool = new Pool({ connectionString: DATABASE_URL });

type SatelliteRow = {
  id: number;
  norad_id: number;
  name: string;
  tle_line1: string;
  tle_line2: string;
};

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
});

app.get("/health", async () => ({ ok: true }));

app.get("/api/satellites", async (_request, reply) => {
  try {
    const result = await pool.query<SatelliteRow>(
      `SELECT id, norad_id, name, tle_line1, tle_line2
       FROM satellites
       WHERE enabled = TRUE
       ORDER BY name ASC`,
    );

    const satellites = result.rows.map((row) => ({
      id: row.id,
      noradId: row.norad_id,
      name: row.name,
      tleLine1: row.tle_line1,
      tleLine2: row.tle_line2,
    }));

    return satellites;
  } catch (err) {
    app.log.error(err);
    return reply.status(500).send({ error: "Failed to load satellites" });
  }
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
