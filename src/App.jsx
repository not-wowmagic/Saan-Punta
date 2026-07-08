import React, { useState, useEffect } from 'react';
import { Route } from 'lucide-react';
import routesData from './data/routes.json';
import { getSortedRoutes } from './utils/graph';
import DisclaimerBanner from './components/DisclaimerBanner';
import DisclaimerModal from './components/DisclaimerModal';
import RouteSearch from './components/RouteSearch';
import RouteList from './components/RouteList';
import RouteMap from './components/RouteMap';

export default function App() {
  const { nodes, legs } = routesData;

  const [startNode, setStartNode] = useState('');
  const [destinationNode, setDestinationNode] = useState('');
  const [isDiscounted, setIsDiscounted] = useState(false);
  
  // Transport preferences
  const [tricycleMode, setTricycleMode] = useState('shared');
  const [busPreference, setBusPreference] = useState('aircon');
  const [trainPreference, setTrainPreference] = useState('svc');
  
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

  // Calculate sorted routes when start, destination, discount status, or transport preferences change
  const allRoutes = getSortedRoutes(legs, startNode, destinationNode, isDiscounted, {
    tricycleMode,
    busPreference,
    trainPreference
  });

  // Limit display to the top 15 routes to avoid performance/rendering lag
  const routes = allRoutes.slice(0, 15);

  // Reset selected route index when any routing input changes
  useEffect(() => {
    setSelectedRouteIndex(0);
  }, [startNode, destinationNode, isDiscounted, tricycleMode, busPreference, trainPreference]);

  const activeRoute = routes[selectedRouteIndex] || null;

  return (
    <div className="app-container">
      {/* Persistent Disclaimer Banner */}
      <DisclaimerBanner onOpenModal={() => setIsDisclaimerOpen(true)} />

      {/* Main Branding Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="brand">
            <div className="logo-icon">
              <Route size={22} strokeWidth={2.5} />
            </div>
            <div className="brand-text">
              <h1>Saan Punta</h1>
              <p>Commute Route Finder & Fare Calculator</p>
            </div>
          </div>
        </div>
      </header>

      {/* Grid Dashboard */}
      <main className="main-content">
        {/* Sidebar Controls and Cards */}
        <section className="sidebar-panel">
          <RouteSearch
            nodes={nodes}
            startNode={startNode}
            setStartNode={setStartNode}
            destinationNode={destinationNode}
            setDestinationNode={setDestinationNode}
            isDiscounted={isDiscounted}
            setIsDiscounted={setIsDiscounted}
            tricycleMode={tricycleMode}
            setTricycleMode={setTricycleMode}
            busPreference={busPreference}
            setBusPreference={setBusPreference}
            trainPreference={trainPreference}
            setTrainPreference={setTrainPreference}
          />

          <RouteList
            routes={routes}
            totalRoutesCount={allRoutes.length}
            selectedRouteIndex={selectedRouteIndex}
            setSelectedRouteIndex={setSelectedRouteIndex}
            nodes={nodes}
            startNode={startNode}
            destinationNode={destinationNode}
          />
        </section>

        {/* Map Visualization */}
        <section className="map-panel">
          <RouteMap
            activeRoute={activeRoute}
            allNodes={nodes}
          />
        </section>
      </main>

      {/* Acknowledgment Modal (First-load auto-popup or manually reopened) */}
      <DisclaimerModal
        isOpenOverride={isDisclaimerOpen ? true : undefined}
        onCloseOverride={() => setIsDisclaimerOpen(false)}
      />
    </div>
  );
}
