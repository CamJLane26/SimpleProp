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
  satellite_id: number;
  norad_id: number;
  name: string;
  tle_id: string;
  epoch: Date;
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
      `SELECT
         s.id AS satellite_id,
         s.norad_id,
         s.name,
         t.id AS tle_id,
         t.epoch,
         t.tle_line1,
         t.tle_line2
       FROM satellites s
       JOIN satellite_tles t ON t.satellite_id = s.id
       WHERE s.enabled = TRUE
       ORDER BY s.name ASC, t.epoch ASC`,
    );

    const byId = new Map<
      number,
      {
        id: number;
        noradId: number;
        name: string;
        tles: {
          id: string;
          epoch: string;
          tleLine1: string;
          tleLine2: string;
        }[];
      }
    >();

    for (const row of result.rows) {
      let satellite = byId.get(row.satellite_id);
      if (!satellite) {
        satellite = {
          id: row.satellite_id,
          noradId: row.norad_id,
          name: row.name,
          tles: [],
        };
        byId.set(row.satellite_id, satellite);
      }
      satellite.tles.push({
        id: row.tle_id,
        epoch: row.epoch.toISOString(),
        tleLine1: row.tle_line1,
        tleLine2: row.tle_line2,
      });
    }

    return [...byId.values()];
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
