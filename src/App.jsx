import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Route } from 'lucide-react';
import routesData from './data/routes.json';
import { findRouteAlternatives } from './utils/k-shortest';
import { DEFAULT_PROFILE_ID } from './utils/profiles';
import DisclaimerBanner from './components/DisclaimerBanner';
import DisclaimerModal from './components/DisclaimerModal';
import RouteSearch from './components/RouteSearch';
import RouteList from './components/RouteList';

const RouteMap = lazy(() => import('./components/RouteMap'));


export default function App() {
  const { nodes, legs } = routesData;

  const [startNode, setStartNode] = useState('');
  const [destinationNode, setDestinationNode] = useState('');
  const [isDiscounted, setIsDiscounted] = useState(false);
  
  // Transport preferences
  const [tricycleMode, setTricycleMode] = useState('shared');
  const [busPreference, setBusPreference] = useState('aircon');
  const [trainPreference, setTrainPreference] = useState('svc');
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

  // ponytail: Pre-build an O(1) index map for node lookups to avoid O(N) array search on every render/leg
  const nodesById = useMemo(() => {
    return Object.fromEntries(nodes.map(n => [n.id, n]));
  }, [nodes]);

  // ponytail: memoize route computation and display list to prevent recalculations on every render
  const allRoutes = useMemo(() => {
    if (!startNode || !destinationNode || startNode === destinationNode) {
      return [];
    }
    return findRouteAlternatives(legs, startNode, destinationNode, isDiscounted, {
      profileId,
      tricycleMode,
      busPreference,
      trainPreference
    });
  }, [legs, startNode, destinationNode, isDiscounted, profileId, tricycleMode, busPreference, trainPreference]);

  // Limit display to the top 15 routes to avoid performance/rendering lag
  const routes = useMemo(() => allRoutes.slice(0, 15), [allRoutes]);

  // Reset selected route index when any routing input changes
  useEffect(() => {
    setSelectedRouteIndex(0);
  }, [startNode, destinationNode, isDiscounted, profileId, tricycleMode, busPreference, trainPreference]);

  const activeRoute = routes[selectedRouteIndex] || null;

  return (
    <div className="app-container">
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
            profileId={profileId}
            setProfileId={setProfileId}
          />

          <RouteList
            routes={routes}
            totalRoutesCount={allRoutes.length}
            selectedRouteIndex={selectedRouteIndex}
            setSelectedRouteIndex={setSelectedRouteIndex}
            nodesById={nodesById}
            startNode={startNode}
            destinationNode={destinationNode}
          />
        </section>

        {/* Map Visualization */}
        <section className="map-panel">
          <Suspense fallback={
            <div className="status-placeholder glass-card animate-fade-in" style={{ height: '100%' }}>
              <h3>Loading Map...</h3>
            </div>
          }>
            <RouteMap
              activeRoute={activeRoute}
              nodesById={nodesById}
              allNodes={nodes}
            />
          </Suspense>
        </section>
      </main>


      {/* Persistent Disclaimer Footer */}
      <DisclaimerBanner onOpenModal={() => setIsDisclaimerOpen(true)} />

      {/* Acknowledgment Modal (First-load auto-popup or manually reopened) */}
      <DisclaimerModal
        isOpenOverride={isDisclaimerOpen ? true : undefined}
        onCloseOverride={() => setIsDisclaimerOpen(false)}
      />
    </div>
  );
}
