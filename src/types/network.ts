export interface WifiSettings {
  enabled: boolean;
  ssid: string;
  password: string;
  connected: boolean;
  status: 'connected' | 'auth_failed' | 'no_signal' | 'disabled';
  lastError?: string;
  signalStrength?: number; // 0 bis 100%
}
