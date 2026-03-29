import { useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AnalyzeRouteResponse } from './types';

// Fix default Leaflet marker icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const KZ_CENTER: [number, number] = [48.0196, 66.9237];
const KZ_ZOOM = 6;
const API_BASE = '/api/v1';

// Custom colored markers
const createIcon = (color: string) =>
  new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 24px; height: 24px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });

const startMarkerIcon = createIcon('#059669');
const endMarkerIcon = createIcon('#dc2626');

// ───────── Map click handler component ─────────
function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function App() {
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [endPoint, setEndPoint] = useState<[number, number] | null>(null);
  const [placingMode, setPlacingMode] = useState<'start' | 'end' | null>('start');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeRouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (placingMode === 'start') {
        setStartPoint([lat, lng]);
        setPlacingMode('end');
        setResult(null);
        setError(null);
      } else if (placingMode === 'end') {
        setEndPoint([lat, lng]);
        setPlacingMode(null);
        setResult(null);
        setError(null);
      }
    },
    [placingMode],
  );

  const handleReset = useCallback(() => {
    setStartPoint(null);
    setEndPoint(null);
    setPlacingMode('start');
    setResult(null);
    setError(null);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!startPoint || !endPoint) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const resp = await fetch(`${API_BASE}/analyze-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: startPoint[0],
          start_lng: startPoint[1],
          end_lat: endPoint[0],
          end_lng: endPoint[1],
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }

      const data: AnalyzeRouteResponse = await resp.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, [startPoint, endPoint]);

  const riskClass = result?.risk_level || 'low';
  const maxContribution = result
    ? Math.max(...result.shap_breakdown.map((f) => f.contribution))
    : 1;

  // GeoJSON Feature for the OSRM route
  const routeGeoJSON = useMemo(() => {
    if (!result?.route_geojson) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: result.route_geojson,
    };
  }, [result]);

  const routeStyle = useMemo(
    () => ({
      color:
        riskClass === 'critical'
          ? '#dc2626'
          : riskClass === 'high'
          ? '#ea580c'
          : riskClass === 'medium'
          ? '#d97706'
          : '#059669',
      weight: 5,
      opacity: 0.85,
    }),
    [riskClass],
  );

  return (
    <div className="app">
      {/* ──── Sidebar ──── */}
      <aside className="sidebar">
        <div className="header">
          <div className="header__brand">
            <span className="header__logo">inDala AI</span>
            <span className="header__badge">Decentrathon 5.0</span>
          </div>
          <p className="header__subtitle">
            Предиктивная система оценки сельской мобильности
          </p>
        </div>

        {/* Route Input */}
        <div className="route-panel">
          <h2 className="route-panel__title">Маршрут</h2>

          {/* Instruction banner */}
          {placingMode && (
            <div className={`place-hint place-hint--${placingMode}`}>
              <span className="place-hint__icon">
                {placingMode === 'start' ? '🟢' : '🔴'}
              </span>
              <span className="place-hint__text">
                {placingMode === 'start'
                  ? 'Кликните на карту — выберите точку отправления'
                  : 'Кликните на карту — выберите точку назначения'}
              </span>
            </div>
          )}

          <div className="route-info">
            {/* Start point */}
            <div
              className={`route-info__point ${!startPoint ? 'route-info__point--empty' : ''}`}
              onClick={() => {
                setPlacingMode('start');
              }}
              role="button"
              tabIndex={0}
            >
              <div className="route-info__dot route-info__dot--start" />
              <span className="route-info__text">
                {startPoint ? 'Откуда' : 'Нажмите, чтобы выбрать'}
              </span>
              {startPoint && (
                <span className="route-info__coords">
                  {startPoint[0].toFixed(4)}, {startPoint[1].toFixed(4)}
                </span>
              )}
            </div>

            {/* End point */}
            <div
              className={`route-info__point ${!endPoint ? 'route-info__point--empty' : ''}`}
              onClick={() => {
                setPlacingMode('end');
              }}
              role="button"
              tabIndex={0}
            >
              <div className="route-info__dot route-info__dot--end" />
              <span className="route-info__text">
                {endPoint ? 'Куда' : 'Нажмите, чтобы выбрать'}
              </span>
              {endPoint && (
                <span className="route-info__coords">
                  {endPoint[0].toFixed(4)}, {endPoint[1].toFixed(4)}
                </span>
              )}
            </div>
          </div>

          <div className="route-panel__actions">
            <button
              id="analyze-btn"
              className={`route-panel__btn ${loading ? 'route-panel__btn--loading' : ''}`}
              disabled={loading || !startPoint || !endPoint}
              onClick={handleAnalyze}
            >
              {loading ? 'Анализ маршрута...' : '🔍 Анализировать'}
            </button>
            <button
              className="route-panel__btn-secondary"
              onClick={handleReset}
              disabled={loading}
            >
              ↺ Сброс
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <div className="error-banner">{error}</div>}

        {/* Results */}
        {result ? (
          <div className="results fade-in">
            <h2 className="results__title">Результат анализа</h2>

            {/* Score */}
            <div className="score-card">
              <div className="score-display">
                <span className={`score-display__number score-display__number--${riskClass}`}>
                  {result.mobility_score}
                </span>
                <div className="score-display__meta">
                  <span className="score-display__label">
                    Индекс уязвимости
                  </span>
                  <span className={`risk-badge risk-badge--${riskClass}`}>
                    {riskClass === 'critical' && '🔴 Критический'}
                    {riskClass === 'high' && '🟠 Высокий'}
                    {riskClass === 'medium' && '🟡 Средний'}
                    {riskClass === 'low' && '🟢 Низкий'}
                  </span>
                </div>
              </div>

              <div className="score-bar">
                <div
                  className={`score-bar__fill score-bar__fill--${riskClass}`}
                  style={{ width: `${result.mobility_score}%` }}
                />
              </div>

              {/* Route Stats */}
              <div className="route-stats">
                <div className="route-stat">
                  <div className="route-stat__value">
                    {result.distance_km.toFixed(1)}
                  </div>
                  <div className="route-stat__label">км</div>
                </div>
                <div className="route-stat">
                  <div className="route-stat__value">
                    {result.duration_mins.toFixed(0)}
                  </div>
                  <div className="route-stat__label">минут</div>
                </div>
              </div>
            </div>

            {/* Subsidy */}
            <div className="subsidy-card">
              <div>
                <div className="subsidy-card__label">
                  Рекомендуемая субсидия водителю
                </div>
              </div>
              <div>
                <span className="subsidy-card__amount">
                  {result.subsidy_kzt.toLocaleString('ru-RU')}
                </span>
                <span className="subsidy-card__currency">₸</span>
              </div>
            </div>

            {/* SHAP */}
            <div className="score-card">
              <div className="shap-section">
                <h3 className="shap-section__title">
                  SHAP — Объяснение модели (XAI)
                </h3>
                {result.shap_breakdown.map((f, i) => (
                  <div className="shap-factor" key={i}>
                    <span className="shap-factor__name">{f.factor}</span>
                    <span className="shap-factor__value">+{f.contribution}</span>
                    <div className="shap-factor__bar-wrapper">
                      <div className="shap-factor__bar">
                        <div
                          className="shap-factor__bar-fill"
                          style={{
                            width: `${(f.contribution / maxContribution) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="model-info">
                <span className="model-info__text">Версия модели</span>
                <span className="model-info__version">{result.model_version}</span>
              </div>
            </div>
          </div>
        ) : (
          !error &&
          !placingMode && startPoint && endPoint && (
            <div className="results">
              <div className="empty-state">
                <div className="empty-state__icon">🗺️</div>
                <p className="empty-state__text">
                  Точки выбраны! Нажмите<br />
                  «Анализировать» для получения<br />
                  оценки уязвимости маршрута
                </p>
              </div>
            </div>
          )
        )}

        {!startPoint && !placingMode && (
          <div className="results">
            <div className="empty-state">
              <div className="empty-state__icon">📍</div>
              <p className="empty-state__text">
                Кликните на карту, чтобы<br />
                выбрать точки маршрута
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* ──── Map ──── */}
      <div className="map-container">
        <MapContainer
          center={KZ_CENTER}
          zoom={KZ_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />

          <MapClickHandler onMapClick={handleMapClick} />

          {/* Start marker */}
          {startPoint && (
            <Marker position={startPoint} icon={startMarkerIcon}>
              <Popup>📍 Откуда: {startPoint[0].toFixed(4)}, {startPoint[1].toFixed(4)}</Popup>
            </Marker>
          )}

          {/* End marker */}
          {endPoint && (
            <Marker position={endPoint} icon={endMarkerIcon}>
              <Popup>📍 Куда: {endPoint[0].toFixed(4)}, {endPoint[1].toFixed(4)}</Popup>
            </Marker>
          )}

          {/* OSRM route — precise road geometry */}
          {routeGeoJSON && (
            <GeoJSON
              key={result?.analyzed_at}
              data={routeGeoJSON}
              style={routeStyle}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
