package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

// ───────────── Request / Response DTOs ─────────────

type AnalyzeRouteRequest struct {
	StartLat float64 `json:"start_lat"`
	StartLng float64 `json:"start_lng"`
	EndLat   float64 `json:"end_lat"`
	EndLng   float64 `json:"end_lng"`
}

// OSRM GeoJSON structures
type OSRMResponse struct {
	Code   string      `json:"code"`
	Routes []OSRMRoute `json:"routes"`
}

type OSRMRoute struct {
	Distance float64         `json:"distance"` // meters
	Duration float64         `json:"duration"` // seconds
	Geometry json.RawMessage `json:"geometry"` // GeoJSON LineString
}

// ML service structures
type MLRequest struct {
	StartLat     float64 `json:"start_lat"`
	StartLng     float64 `json:"start_lng"`
	EndLat       float64 `json:"end_lat"`
	EndLng       float64 `json:"end_lng"`
	DistanceKm   float64 `json:"distance_km"`
	DurationMins float64 `json:"duration_mins"`
}

type SHAPFactor struct {
	Factor       string  `json:"factor"`
	Contribution float64 `json:"contribution"`
}

type MLPrediction struct {
	MobilityScore float64      `json:"mobility_score"`
	RiskLevel     string       `json:"risk_level"`
	SubsidyKZT    int          `json:"subsidy_kzt"`
	SHAPBreakdown []SHAPFactor `json:"shap_breakdown"`
	ModelVersion  string       `json:"model_version"`
}

type AnalyzeRouteResponse struct {
	StartLat     float64         `json:"start_lat"`
	StartLng     float64         `json:"start_lng"`
	EndLat       float64         `json:"end_lat"`
	EndLng       float64         `json:"end_lng"`
	DistanceKm   float64         `json:"distance_km"`
	DurationMins float64         `json:"duration_mins"`
	RouteGeoJSON json.RawMessage `json:"route_geojson"`
	MobilityScore float64       `json:"mobility_score"`
	RiskLevel     string        `json:"risk_level"`
	SubsidyKZT    int           `json:"subsidy_kzt"`
	SHAPBreakdown []SHAPFactor  `json:"shap_breakdown"`
	ModelVersion  string        `json:"model_version"`
	AnalyzedAt    string        `json:"analyzed_at"`
}

// ───────────── Helpers ─────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// queryOSRM fetches the driving route from the local OSRM container.
// CRITICAL: OSRM expects [longitude, latitude] order in the URL.
func queryOSRM(startLat, startLng, endLat, endLng float64) (*OSRMRoute, error) {
	osrmURL := getEnv("OSRM_URL", "http://osrm-backend:5000")
	url := fmt.Sprintf(
		"%s/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson",
		osrmURL,
		startLng, startLat, // lon,lat for start
		endLng, endLat,     // lon,lat for end
	)

	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("OSRM request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read OSRM response: %w", err)
	}

	var osrmResp OSRMResponse
	if err := json.Unmarshal(body, &osrmResp); err != nil {
		return nil, fmt.Errorf("failed to parse OSRM response: %w", err)
	}

	if osrmResp.Code != "Ok" || len(osrmResp.Routes) == 0 {
		return nil, fmt.Errorf("OSRM returned no routes (code: %s)", osrmResp.Code)
	}

	return &osrmResp.Routes[0], nil
}

// queryML sends route data to the Python ML service for scoring.
func queryML(req MLRequest) (*MLPrediction, error) {
	mlURL := fmt.Sprintf("%s/predict", getEnv("ML_SERVICE_URL", "http://python-ml:8000"))

	payload, _ := json.Marshal(req)
	resp, err := http.Post(mlURL, "application/json", bytes.NewBuffer(payload))
	if err != nil {
		return nil, fmt.Errorf("ML service request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read ML response: %w", err)
	}

	var prediction MLPrediction
	if err := json.Unmarshal(body, &prediction); err != nil {
		return nil, fmt.Errorf("failed to parse ML response: %w", err)
	}

	return &prediction, nil
}

// ───────────── Handlers ─────────────

func analyzeRoute(c *fiber.Ctx) error {
	var req AnalyzeRouteRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.StartLat == 0 || req.StartLng == 0 || req.EndLat == 0 || req.EndLng == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "start_lat, start_lng, end_lat, end_lng are all required",
		})
	}

	// 1. Query OSRM for precise road routing
	route, err := queryOSRM(req.StartLat, req.StartLng, req.EndLat, req.EndLng)
	if err != nil {
		log.Printf("OSRM error: %v", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": fmt.Sprintf("Routing service unavailable: %v", err),
		})
	}

	distanceKm := route.Distance / 1000.0
	durationMins := route.Duration / 60.0

	// 2. Query Python ML service for vulnerability scoring
	prediction, err := queryML(MLRequest{
		StartLat:     req.StartLat,
		StartLng:     req.StartLng,
		EndLat:       req.EndLat,
		EndLng:       req.EndLng,
		DistanceKm:   distanceKm,
		DurationMins: durationMins,
	})
	if err != nil {
		log.Printf("ML service error: %v", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": fmt.Sprintf("ML service unavailable: %v", err),
		})
	}

	// 3. Combine into final response
	result := AnalyzeRouteResponse{
		StartLat:      req.StartLat,
		StartLng:      req.StartLng,
		EndLat:        req.EndLat,
		EndLng:        req.EndLng,
		DistanceKm:    distanceKm,
		DurationMins:  durationMins,
		RouteGeoJSON:  route.Geometry,
		MobilityScore: prediction.MobilityScore,
		RiskLevel:     prediction.RiskLevel,
		SubsidyKZT:    prediction.SubsidyKZT,
		SHAPBreakdown: prediction.SHAPBreakdown,
		ModelVersion:  prediction.ModelVersion,
		AnalyzedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	return c.JSON(result)
}

func healthCheck(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":  "healthy",
		"service": "indala-gateway",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

// ───────────── Main ─────────────

func main() {
	app := fiber.New(fiber.Config{
		AppName:      "inDala AI Gateway",
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,OPTIONS",
		AllowHeaders: "Content-Type,Authorization",
	}))

	app.Get("/health", healthCheck)

	api := app.Group("/api/v1")
	api.Post("/analyze-route", analyzeRoute)

	port := getEnv("GO_PORT", "8080")
	log.Printf("🚀 inDala Gateway starting on :%s", port)
	log.Fatal(app.Listen(":" + port))
}
