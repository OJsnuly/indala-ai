export interface SHAPFactor {
  factor: string;
  contribution: number;
}

export interface AnalyzeRouteResponse {
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_km: number;
  duration_mins: number;
  route_geojson: GeoJSON.LineString;
  mobility_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  subsidy_kzt: number;
  shap_breakdown: SHAPFactor[];
  model_version: string;
  analyzed_at: string;
}
