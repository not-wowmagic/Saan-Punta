import React from 'react';
import { Bus, Train, Car, Bike, Footprints, Zap, ArrowRight, Info, AlertTriangle, Lightbulb } from 'lucide-react';

const MODE_ICONS = {
  jeepney: Bus,
  bus: Bus,
  train: Train,
  taxi: Car,
  moto_taxi: Bike,
  walk: Footprints,
  tricycle: Zap
};

const MODE_LABELS = {
  jeepney: "Jeepney",
  bus: "Public Bus",
  train: "LRT/MRT Train",
  taxi: "Taxi",
  moto_taxi: "Motorcycle Taxi",
  walk: "Walk",
  tricycle: "Tricycle"
};

export default function RouteList({
  routes,
  totalRoutesCount,
  selectedRouteIndex,
  setSelectedRouteIndex,
  nodes,
  startNode,
  destinationNode
}) {
  const getNodeName = (id) => {
    const node = nodes.find(n => n.id === id);
    return node ? node.name : id;
  };

  if (!startNode || !destinationNode) {
    return (
      <div className="status-placeholder glass-card animate-fade-in">
        <Info size={32} className="placeholder-icon text-muted" />
        <h3>Select Locations</h3>
        <p>Choose a starting point and destination above to see available public transit and commute route options.</p>
      </div>
    );
  }

  if (startNode === destinationNode) {
    return (
      <div className="status-placeholder status-warning glass-card animate-fade-in">
        <AlertTriangle size={32} className="placeholder-icon text-warning" />
        <h3>Same Location</h3>
        <p>Starting point and destination cannot be the same. Please select different locations to route.</p>
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="status-placeholder status-error glass-card animate-fade-in">
        <AlertTriangle size={32} className="placeholder-icon text-error" />
        <h3>No Routes Found</h3>
        <p>
          We couldn't find any direct or transfer connections between these locations in our database.
        </p>
        <p className="text-xs text-muted mt-2">
          Note: Saan Punta routes are currently curated for the Valenzuela and Caloocan areas.
        </p>
      </div>
    );
  }

  return (
    <div className="routes-list-container" id="routes-results-list">
      <h3 className="section-title-sm mb-3">
        Available Route Options ({totalRoutesCount > routes.length ? `Showing top ${routes.length} of ${totalRoutesCount}` : routes.length})
      </h3>
      
      <div className="routes-cards-stack">
        {routes.map((route, rIdx) => {
          const isSelected = selectedRouteIndex === rIdx;
          
          return (
            <div
              key={rIdx}
              className={`route-card glass-card ${isSelected ? 'active-route-card' : ''} animate-fade-in`}
              onClick={() => setSelectedRouteIndex(rIdx)}
              style={{ animationDelay: `${rIdx * 0.05}s` }}
            >
              {/* Card Summary Header */}
              <div className="route-card-header">
                <div className="route-fare-cost">
                  <span className="fare-label">Estimated Fare</span>
                  <span className="fare-value">{route.fareText}</span>
                </div>
                
                <div className="route-stats">
                  <span className="stat-badge">
                    {route.totalDistance.toFixed(1)} km
                  </span>
                  <span className="stat-badge">
                    {route.legCount === 1 ? 'Direct' : `${route.legCount - 1} transfer${route.legCount > 2 ? 's' : ''}`}
                  </span>
                </div>
              </div>

              {/* Mode Badges Strip */}
              <div className="mode-strip">
                {route.legs.map((step, sIdx) => {
                  const Icon = MODE_ICONS[step.leg.mode] || Bus;
                  return (
                    <React.Fragment key={sIdx}>
                      {sIdx > 0 && <ArrowRight size={14} className="strip-arrow" />}
                      <span className={`mode-badge mode-${step.leg.mode}`}>
                        <Icon size={12} />
                        <span className="badge-text">
                          {step.leg.mode === 'jeepney' 
                            ? (step.leg.fare_type === 'modern' ? 'E-Jeep' : 'Jeep') 
                            : step.leg.mode === 'moto_taxi' ? 'MC Taxi' : MODE_LABELS[step.leg.mode]}
                        </span>
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Expanded Card Details */}
              {isSelected && (
                <div className="route-expanded-details animate-slide-down">
                  <div className="divider"></div>
                  <h4 className="detail-title">Step-by-step Commute Guide:</h4>
                  
                  <div className="step-timeline">
                    {route.legs.map((step, sIdx) => {
                      const Icon = MODE_ICONS[step.leg.mode] || Bus;
                      const isMotoTaxi = step.leg.mode === 'moto_taxi';
                      const isTaxi = step.leg.mode === 'taxi';
                      const hasNotes = !!step.leg.notes;

                      return (
                        <div key={sIdx} className="timeline-step">
                          <div className="step-marker-container">
                            <div className={`step-icon-bg mode-${step.leg.mode}`}>
                              <Icon size={16} />
                            </div>
                            {sIdx < route.legs.length - 1 && <div className="step-connector"></div>}
                          </div>

                          <div className="step-info-card">
                            <div className="step-header-row">
                              <span className="step-mode-title">
                                {MODE_LABELS[step.leg.mode]}
                                {step.leg.route_name && ` (${step.leg.route_name})`}
                              </span>
                              <span className="step-fare">
                                {step.fareDetails.text}
                              </span>
                            </div>

                            <div className="step-routing">
                              <span className="step-node-name">{getNodeName(step.fromNode)}</span>
                              <ArrowRight size={12} className="routing-arrow" />
                              <span className="step-node-name">{getNodeName(step.toNode)}</span>
                            </div>

                            <div className="step-meta">
                              <span className="meta-item">{step.distance.toFixed(1)} km</span>
                              {step.leg.fare_type && (
                                <span className="meta-item fare-type-badge">
                                  {step.leg.fare_type} rate
                                </span>
                              )}
                            </div>

                            {/* Regulated taxi label */}
                            {isTaxi && (
                              <div className="mode-warning-text warning-taxi">
                                <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                                Taxi: flagdown & distance formula; taxi rates are regulated but variable by traffic conditions.
                              </div>
                            )}

                            {/* Moto taxi disclaimer requirement */}
                            {isMotoTaxi && (
                              <div className="mode-warning-text warning-mototaxi" id={`warning-mototaxi-${sIdx}`}>
                                <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                                Motorcycle Taxi: rough estimate, not sourced from any official rate. Surge pricing applies.
                              </div>
                            )}

                            {hasNotes && (
                              <div className="step-description">
                                <Lightbulb size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom', color: '#f59e0b' }} />
                                {step.leg.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
