export interface TelemetryRow {
  [key: string]: string | number | null;
}

export interface Metadata {
  [key: string]: string | number | undefined;
}

export interface TelemetryData {
  file: string;
  car: string;
  track: string;
  rows: number;
  columns: string[];
  data: TelemetryRow[];
  metadata?: Metadata;
}
