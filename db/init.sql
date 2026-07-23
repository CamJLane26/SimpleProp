-- SimpleProp: fresh satellite catalog + public TLE seed (CelesTrak)
-- MVP catalog: ~15 LEO satellites for sensor FOR visualization.
-- NORAD IDs are not unique: multiple catalog rows may share a NORAD ID.

CREATE OR REPLACE FUNCTION parse_tle_epoch(tle_line1 TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  WITH parts AS (
    SELECT
      substring(tle_line1 FROM 19 FOR 2)::INTEGER AS short_year,
      substring(tle_line1 FROM 21 FOR 12)::DOUBLE PRECISION AS day_of_year
  )
  SELECT
    make_timestamptz(
      CASE
        WHEN short_year < 57 THEN 2000 + short_year
        ELSE 1900 + short_year
      END,
      1, 1, 0, 0, 0, 'UTC'
    ) + (day_of_year - 1) * INTERVAL '1 day'
  FROM parts;
$$;

CREATE TABLE satellites (
  id          SERIAL PRIMARY KEY,
  norad_id    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE satellite_tles (
  id            BIGSERIAL PRIMARY KEY,
  satellite_id  INTEGER NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  epoch         TIMESTAMPTZ NOT NULL,
  tle_line1     TEXT NOT NULL,
  tle_line2     TEXT NOT NULL,
  UNIQUE (satellite_id, epoch)
);

CREATE TEMP TABLE seed_satellites (
  seed_id     SERIAL PRIMARY KEY,
  norad_id    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  tle_line1   TEXT NOT NULL,
  tle_line2   TEXT NOT NULL
);

INSERT INTO seed_satellites (norad_id, name, tle_line1, tle_line2) VALUES
  (25544, 'ISS (ZARYA)', '1 25544U 98067A   26202.18553447  .00005896  00000+0  11479-3 0  9991', '2 25544  51.6316 131.8443 0006849 320.6461  39.4029 15.49071756577020'),
  (20580, 'HST', '1 20580U 90037B   26202.36670297  .00004372  00000+0  13390-3 0  9990', '2 20580  28.4722 206.9020 0002079 163.2375 196.8290 15.31101055793811'),
  (25994, 'TERRA', '1 25994U 99068A   26202.61954139  .00000241  00000+0  58077-4 0  9998', '2 25994  97.9436 250.7972 0003622 110.2563  49.2698 14.61127057414632'),
  (41335, 'SENTINEL-3A', '1 41335U 16011A   26202.58017934  .00000041  00000+0  35166-4 0  9993', '2 41335  98.6232 269.4668 0001303  88.7627 271.3703 14.26740972542965'),
  (38771, 'METOP-B', '1 38771U 12049A   26202.61072963  .00000042  00000+0  38851-4 0  9992', '2 38771  98.6485 253.4198 0001346 221.8467 138.2608 14.21447602718155'),
  (40069, 'METEOR-M 2', '1 40069U 14037A   26202.56620946 -.00000010  00000+0  14927-4 0  9992', '2 40069  98.5143 177.0912 0004764 305.4497  54.6236 14.21469887624201'),
  (39260, 'FENGYUN 3C', '1 39260U 13052A   26202.60306904  .00000067  00000+0  55037-4 0  9997', '2 39260  98.5005 174.9022 0013475 286.0849  73.8842 14.15761748663439'),
  (28485, 'SWIFT', '1 28485U 04047A   26202.43279528  .00050543  00000+0  36481-3 0  9995', '2 28485  20.5518 280.0692 0002705  92.0040 268.0717 15.71674184192250'),
  (26998, 'TIMED', '1 26998U 01055B   26202.32969157  .00000817  00000+0  77679-4 0  9994', '2 26998  74.0672 166.2696 0002369 293.6419  66.4517 14.95353320335928'),
  (67796, 'CREW DRAGON 12', '1 67796U 26031A   26202.18553447  .00005896  00000+0  11479-3 0  9998', '2 67796  51.6316 131.8443 0006849 320.6461  39.4029 15.49071756576417'),
  (48274, 'CSS (TIANHE)', '1 48274U 21035A   26202.43210246  .00010973  00000+0  14512-3 0  9995', '2 48274  41.4683 114.0267 0001746 306.5318  53.5359 15.58235366298517'),
  (44714, 'STARLINK-1008', '1 44714U 19074B   26202.43561651  .00042580  00000+0  64816-3 0  9990', '2 44714  53.1499 264.2217 0005598 344.9467  15.1377 15.54101705369530'),
  (44747, 'STARLINK-1042', '1 44747U 19074AL  26202.63146751  .00024278  00000+0  34783-3 0  9992', '2 44747  53.0417 168.9654 0001427  57.7899 302.3250 15.56064760370887'),
  (27858, 'SCISAT 1', '1 27858U 03036A   26202.19261917  .00000395  00000+0  55026-4 0  9998', '2 27858  73.9301 103.7789 0007053 170.3636 189.7677 14.81483396236486'),
  (29479, 'HINODE (SOLAR-B)', '1 29479U 06041A   26202.52336412  .00000452  00000+0  85968-4 0  9990', '2 29479  98.0548 218.1700 0017576 174.2351 185.9060 14.68663632 59913');

WITH inserted AS (
  INSERT INTO satellites (norad_id, name)
  SELECT norad_id, name
  FROM seed_satellites
  ORDER BY seed_id
  RETURNING id, norad_id, name
),
numbered_inserted AS (
  SELECT
    id,
    row_number() OVER (ORDER BY id) AS seed_id
  FROM inserted
)
INSERT INTO satellite_tles (satellite_id, epoch, tle_line1, tle_line2)
SELECT
  numbered_inserted.id,
  parse_tle_epoch(seed_satellites.tle_line1),
  seed_satellites.tle_line1,
  seed_satellites.tle_line2
FROM numbered_inserted
JOIN seed_satellites USING (seed_id);

-- Helpers for demo TLE transitions near session "Now".
CREATE OR REPLACE FUNCTION tle_checksum(line_body TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT (
    SELECT SUM(
      CASE
        WHEN ch ~ '[0-9]' THEN ch::INTEGER
        WHEN ch = '-' THEN 1
        ELSE 0
      END
    )
    FROM unnest(string_to_array(line_body, NULL)) AS ch
  ) % 10;
$$;

CREATE OR REPLACE FUNCTION rewrite_tle_line1_epoch(
  line1 TEXT,
  new_epoch TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  year_two INTEGER;
  day_of_year DOUBLE PRECISION;
  epoch_field TEXT;
  body TEXT;
BEGIN
  year_two := EXTRACT(YEAR FROM new_epoch AT TIME ZONE 'UTC')::INTEGER % 100;
  day_of_year :=
    EXTRACT(DOY FROM new_epoch AT TIME ZONE 'UTC')::DOUBLE PRECISION
    + EXTRACT(HOUR FROM new_epoch AT TIME ZONE 'UTC')::DOUBLE PRECISION / 24.0
    + EXTRACT(MINUTE FROM new_epoch AT TIME ZONE 'UTC')::DOUBLE PRECISION / 1440.0
    + EXTRACT(SECOND FROM new_epoch AT TIME ZONE 'UTC')::DOUBLE PRECISION / 86400.0;
  epoch_field :=
    lpad(year_two::TEXT, 2, '0')
    || trim(to_char(day_of_year, 'FM000.00000000'));
  IF char_length(epoch_field) <> 14 THEN
    RAISE EXCEPTION 'Invalid TLE epoch field %', epoch_field;
  END IF;

  body := overlay(rpad(left(line1, 68), 68, ' ')
    PLACING epoch_field FROM 19 FOR 14);
  RETURN body || tle_checksum(body)::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION bump_tle_line2_mean_anomaly(
  line2 TEXT,
  delta_deg DOUBLE PRECISION
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  mean_anomaly DOUBLE PRECISION;
  updated TEXT;
  body TEXT;
BEGIN
  mean_anomaly := substring(line2 FROM 44 FOR 8)::DOUBLE PRECISION;
  mean_anomaly := MOD(
    (mean_anomaly + delta_deg + 360.0)::NUMERIC,
    360.0::NUMERIC
  )::DOUBLE PRECISION;
  updated := overlay(rpad(left(line2, 68), 68, ' ')
    PLACING lpad(to_char(mean_anomaly, 'FM990.0000'), 8, ' ')
    FROM 44 FOR 8);
  body := left(updated, 68);
  RETURN body || tle_checksum(body)::TEXT;
END;
$$;

-- Demo transitions:
--   ISS  — newer TLE ~+30 minutes from DB init (scrub forward to see the jump)
--   HST  — newer TLE ~-30 minutes from DB init (scrub backward from "Now")
INSERT INTO satellite_tles (satellite_id, epoch, tle_line1, tle_line2)
SELECT
  s.id,
  parse_tle_epoch(rewrite_tle_line1_epoch(t.tle_line1, clock_timestamp() + INTERVAL '30 minutes')),
  rewrite_tle_line1_epoch(t.tle_line1, clock_timestamp() + INTERVAL '30 minutes'),
  bump_tle_line2_mean_anomaly(t.tle_line2, 18.0)
FROM satellites s
JOIN satellite_tles t ON t.satellite_id = s.id
WHERE s.norad_id = 25544
ORDER BY t.epoch ASC
LIMIT 1;

INSERT INTO satellite_tles (satellite_id, epoch, tle_line1, tle_line2)
SELECT
  s.id,
  parse_tle_epoch(rewrite_tle_line1_epoch(t.tle_line1, clock_timestamp() - INTERVAL '30 minutes')),
  rewrite_tle_line1_epoch(t.tle_line1, clock_timestamp() - INTERVAL '30 minutes'),
  bump_tle_line2_mean_anomaly(t.tle_line2, -22.0)
FROM satellites s
JOIN satellite_tles t ON t.satellite_id = s.id
WHERE s.norad_id = 20580
ORDER BY t.epoch ASC
LIMIT 1;
