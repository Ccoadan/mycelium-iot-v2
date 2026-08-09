export const RELAY_KEYS = ['relay1', 'relay2', 'relay3', 'relay4'] as const;

export type RelayKey = (typeof RELAY_KEYS)[number];

export const CONTROL_SOURCES = ['simulation', 'manual'] as const;
export type ControlSource = (typeof CONTROL_SOURCES)[number];

export interface RelayState {
  key: RelayKey;
  name: string;
  enabled: boolean;
}

export interface ControlState {
  _id: 'current';
  relays: RelayState[];
  lightingSource: ControlSource;
  updatedAt: Date;
  updatedBy: string;
}
