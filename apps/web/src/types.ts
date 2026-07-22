export type Satellite = {
  id: number;
  noradId: number;
  name: string;
  tleLine1: string;
  tleLine2: string;
};

export type SatellitesResponse = {
  satellites: Satellite[];
};
