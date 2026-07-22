export type TleSet = {
  id: string;
  epoch: string;
  tleLine1: string;
  tleLine2: string;
};

export type Satellite = {
  id: number;
  noradId: number;
  name: string;
  tles: TleSet[];
};
