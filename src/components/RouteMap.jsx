import React, { useEffect, useState, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Lock, Unlock } from 'lucide-react';
import { MODE_COLORS, MODE_LABELS } from '../utils/constants';

// Fix Vite asset loader resolving for Leaflet marker icon images
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom SVG Pin Marker Factory (removes green and red circle dots)
// Start pin (A): Slate-grey background
// Destination pin (B): Deep Indigo background
// Transfer pin (T): Blue background
// Generic pin: Neutral Grey
const createPinMarker = (bgColor, labelText) => {
  return L.divIcon({
    html: `
      <div class="custom-svg-pin-wrapper">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="34" height="34" class="custom-svg-pin">
          <path fill="${bgColor}" stroke="#ffffff" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle fill="#ffffff" cx="12" cy="9" r="6"/>
          <text x="12" y="12" fill="${bgColor}" font-size="8.5" font-family="'Outfit', sans-serif" font-weight="900" text-anchor="middle">${labelText}</text>
        </svg>
      </div>
    `,
    className: 'custom-div-icon',
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34]
  });
};

const START_MARKER_ICON = createPinMarker("#1e293b", "A"); // Slate-grey pin with 'A'
const DEST_MARKER_ICON = createPinMarker("#4f46e5", "B");  // Deep Indigo pin with 'B'
const TRANSFER_MARKER_ICON = createPinMarker("#3b82f6", "T"); // Blue pin with 'T'
const GENERIC_MARKER_ICON = createPinMarker("#6b7280", "•"); // Grey pin for other points

// Component to handle auto-fitting map view boundaries to the active route
function MapBoundsUpdater({ bounds }) {
  const map = useMap();
  
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 15,
        animate: true,
        duration: 1.2
      });
    }
  }, [bounds, map]);

  return null;
}

// ponytail: module-level cache that persists in localStorage, capped at 200 entries to protect quota limits
const MAX_CACHE_SIZE = 200;
const roadCoordsCache = new Map();
try {
  const cached = localStorage.getItem('saan_punta_road_coords_cache');
  if (cached) {
    const parsed = JSON.parse(cached);
    const entries = Array.isArray(parsed) ? parsed : Object.entries(parsed);
    for (const [k, v] of entries) {
      roadCoordsCache.set(k, v);
    }
  }
} catch (e) {
  console.warn("Failed to load road coords cache from localStorage", e);
}

function saveCoordsCache() {
  try {
    if (roadCoordsCache.size > MAX_CACHE_SIZE) {
      // Evict oldest entries
      const keysToEvict = Array.from(roadCoordsCache.keys()).slice(0, roadCoordsCache.size - MAX_CACHE_SIZE);
      for (const key of keysToEvict) {
        roadCoordsCache.delete(key);
      }
    }
    localStorage.setItem('saan_punta_road_coords_cache', JSON.stringify(Array.from(roadCoordsCache.entries())));
  } catch (e) {
    console.warn("Failed to save road coords cache to localStorage", e);
  }
}

// ponytail: control Leaflet drag/zoom interactions dynamically
function MapInteractionController({ isLocked }) {
  const map = useMap();
  useEffect(() => {
    if (isLocked) {
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      if (map.tap) map.tap.disable();
    } else {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      if (map.tap) map.tap.enable();
    }
  }, [isLocked, map]);
  return null;
}

function RouteMap({ activeRoute, nodesById, allNodes }) {
  const mapCenter = [14.6812, 120.9763]; // Default Valenzuela coordinates
  const mapZoom = 13;
  const [isMapLocked, setIsMapLocked] = useState(window.innerWidth <= 768);
  
  // State to hold current active route leg coordinates
  const [legCoordinates, setLegCoordinates] = useState({});

  // Fetch street-accurate coordinates from OSRM (debounced & in parallel)
  useEffect(() => {
    let active = true;
    
    if (!activeRoute || activeRoute.legs.length === 0) {
      setLegCoordinates({});
      return;
    }

    // Debounce to prevent spamming requests when rapidly clicking/scrolling through routes
    const timer = setTimeout(() => {
      const fetchRoadRoute = async () => {
        const fetchPromises = activeRoute.legs.map(async (step) => {
          // ponytail: O(1) node lookup dictionary
          const fromNodeObj = nodesById[step.fromNode];
          const toNodeObj = nodesById[step.toNode];

          if (!fromNodeObj || !toNodeObj) return null;

          const legKey = `${step.leg.id}-${step.fromNode}-${step.toNode}`;
          
          // Check cache first
          if (roadCoordsCache.has(legKey)) {
            return { id: step.leg.id, coords: roadCoordsCache.get(legKey) };
          }

          // Fallback is straight line
          const fallbackCoords = [
            [fromNodeObj.lat, fromNodeObj.lng],
            [toNodeObj.lat, toNodeObj.lng]
          ];

          // For walking, draw a straight line directly to avoid overloading routing API
          if (step.leg.mode === 'walk') {
            roadCoordsCache.set(legKey, fallbackCoords);
            saveCoordsCache();
            return { id: step.leg.id, coords: fallbackCoords };
          }

          let coords = null;
          const directUrl = `https://router.project-osrm.org/route/v1/driving/${fromNodeObj.lng},${fromNodeObj.lat};${toNodeObj.lng},${toNodeObj.lat}?overview=full&geometries=geojson`;
          const proxyUrl = `https://corsproxy.io/?https://router.project-osrm.org/route/v1/driving/${fromNodeObj.lng},${fromNodeObj.lat};${toNodeObj.lng},${toNodeObj.lat}?overview=full&geometries=geojson`;

          // Try direct first with timeout
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(directUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              const data = await response.json();
              if (data.code === 'Ok' && data.routes && data.routes[0]) {
                const geojsonCoords = data.routes[0].geometry.coordinates;
                coords = geojsonCoords.map(coord => [coord[1], coord[0]]);
              }
            }
          } catch (error) {
            console.warn(`Direct OSRM fetch failed for leg ${step.leg.id}, trying proxy...`, error);
          }

          // Try proxy if direct failed
          if (!coords) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const response = await fetch(proxyUrl, { signal: controller.signal });
              clearTimeout(timeoutId);

              if (response.ok) {
                const data = await response.json();
                if (data.code === 'Ok' && data.routes && data.routes[0]) {
                  const geojsonCoords = data.routes[0].geometry.coordinates;
                  coords = geojsonCoords.map(coord => [coord[1], coord[0]]);
                }
              }
            } catch (error) {
              console.warn(`Proxy OSRM fetch failed for leg ${step.leg.id}:`, error);
            }
          }

          if (coords) {
            roadCoordsCache.set(legKey, coords);
            saveCoordsCache();
            return { id: step.leg.id, coords };
          }
          return { id: step.leg.id, coords: fallbackCoords };
        });

        const results = await Promise.all(fetchPromises);
        const newLegCoords = {};
        
        results.forEach(res => {
          if (res) {
            newLegCoords[res.id] = res.coords;
          }
        });

        if (active) {
          setLegCoordinates(newLegCoords);
        }
      };

      fetchRoadRoute();
    }, 350); // ponytail: increased debounce from 200ms to 350ms to throttle map API hits on mobile

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeRoute, nodesById]);

  // Compute map bounds and active markers based on selected route
  const bounds = [];
  const routeNodes = [];
  const polylineSegments = [];

  if (activeRoute && activeRoute.legs.length > 0) {
    activeRoute.legs.forEach((step, idx) => {
      // ponytail: O(1) node lookup dictionary
      const fromNodeObj = nodesById[step.fromNode];
      const toNodeObj = nodesById[step.toNode];

      if (fromNodeObj && toNodeObj) {
        const fromCoords = [fromNodeObj.lat, fromNodeObj.lng];
        const toCoords = [toNodeObj.lat, toNodeObj.lng];

        bounds.push(fromCoords);
        bounds.push(toCoords);

        // Use fetched road-accurate coordinates if available, otherwise straight line
        const positions = legCoordinates[step.leg.id] || [fromCoords, toCoords];

        // Add polyline segments
        polylineSegments.push({
          positions,
          color: MODE_COLORS[step.leg.mode] || "#3b82f6",
          dashArray: step.leg.mode === 'walk' ? '5, 8' : null,
          step
        });

        // Collect unique route nodes
        if (!routeNodes.some(n => n.id === fromNodeObj.id)) {
          routeNodes.push({
            ...fromNodeObj,
            type: idx === 0 ? 'start' : 'transfer'
          });
        }
        
        if (!routeNodes.some(n => n.id === toNodeObj.id)) {
          routeNodes.push({
            ...toNodeObj,
            type: idx === activeRoute.legs.length - 1 ? 'end' : 'transfer'
          });
        }
      }
    });
  }

  // Fallback to plotting all nodes on the map if no route is active
  const displayedNodes = routeNodes.length > 0 ? routeNodes : allNodes.map(n => ({ ...n, type: 'generic' }));

  return (
    <div className="map-wrapper glass-card animate-fade-in" id="saan-punta-map-container">
      <button 
        type="button" 
        className="map-lock-btn"
        onClick={() => setIsMapLocked(!isMapLocked)}
        title={isMapLocked ? "Unlock map dragging & zoom" : "Lock map dragging & zoom"}
      >
        {isMapLocked ? <Lock size={14} /> : <Unlock size={14} />}
        <span>{isMapLocked ? "Unlock Map" : "Lock Map"}</span>
      </button>
      <MapContainer 
        center={mapCenter} 
        zoom={mapZoom} 
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', borderRadius: '12px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapInteractionController isLocked={isMapLocked} />

        {/* Polylines for active route */}
        {polylineSegments.map((segment, idx) => (
          <Polyline
            key={idx}
            positions={segment.positions}
            pathOptions={{ 
              color: segment.color, 
              weight: 5, 
              opacity: 0.85,
              dashArray: segment.dashArray
            }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{MODE_LABELS[segment.step.leg.mode]} Leg</strong>
                {segment.step.leg.route_name && <div>Route: {segment.step.leg.route_name}</div>}
                <div>Distance: {segment.step.distance.toFixed(1)} km</div>
                <div>Fare: {segment.step.fareDetails.text}</div>
                {segment.step.leg.mode === 'moto_taxi' && (
                  <div className="text-xs text-warning mt-1">
                    *Rough estimate, not officially sourced.
                  </div>
                )}
              </div>
            </Popup>
          </Polyline>
        ))}

        {/* Markers for nodes */}
        {displayedNodes.map((node) => {
          let markerIcon = GENERIC_MARKER_ICON;
          if (node.type === 'start') markerIcon = START_MARKER_ICON;
          else if (node.type === 'end') markerIcon = DEST_MARKER_ICON;
          else if (node.type === 'transfer') markerIcon = TRANSFER_MARKER_ICON;

          return (
            <Marker 
              key={node.id} 
              position={[node.lat, node.lng]}
              icon={markerIcon}
            >
              <Popup>
                <div className="map-popup">
                  <strong className="node-popup-title">{node.name}</strong>
                  {node.type === 'start' && <span className="popup-badge bg-primary">Starting Point (A)</span>}
                  {node.type === 'end' && <span className="popup-badge bg-danger">Destination (B)</span>}
                  {node.type === 'transfer' && <span className="popup-badge bg-primary">Transfer (T)</span>}
                  
                  {activeRoute && activeRoute.legs.length > 0 && (
                    <div className="popup-legs-info mt-2">
                      {activeRoute.legs.map((step, sIdx) => {
                        if (step.fromNode === node.id || step.toNode === node.id) {
                          return (
                            <div key={sIdx} className="text-xs text-muted">
                              {step.fromNode === node.id ? 'Depart via' : 'Arrive via'}{' '}
                              <strong>{MODE_LABELS[step.leg.mode]}</strong> ({step.distance.toFixed(1)}km)
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Auto fit bounds when route changes */}
        {bounds.length > 0 && <MapBoundsUpdater bounds={bounds} />}
      </MapContainer>
      
      {/* Map Legend */}
      <div className="map-legend">
        <span className="legend-title">Legend:</span>
        <div className="legend-items">
          <div className="legend-item"><span className="legend-line" style={{backgroundColor: MODE_COLORS.jeepney}}></span> Jeepney</div>
          <div className="legend-item"><span className="legend-line" style={{backgroundColor: MODE_COLORS.bus}}></span> Bus</div>
          <div className="legend-item"><span className="legend-line" style={{backgroundColor: MODE_COLORS.tricycle}}></span> Tricycle</div>
          <div className="legend-item"><span className="legend-line" style={{backgroundColor: MODE_COLORS.taxi}}></span> Taxi</div>
          <div className="legend-item"><span className="legend-line" style={{backgroundColor: MODE_COLORS.moto_taxi}}></span> MC Taxi</div>
          <div className="legend-item"><span className="legend-line" style={{backgroundColor: MODE_COLORS.train}}></span> Train</div>
          <div className="legend-item"><span className="legend-line border-dashed" style={{backgroundColor: 'transparent', borderColor: MODE_COLORS.walk}}></span> Walk</div>
        </div>
      </div>
    </div>
  );
}

export default memo(RouteMap);
