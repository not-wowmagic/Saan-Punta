import React, { useState, memo } from 'react';
import { ArrowUpDown, GraduationCap, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import SearchableDropdown from './SearchableDropdown';

function RouteSearch({
  nodes,
  startNode,
  setStartNode,
  destinationNode,
  setDestinationNode,
  isDiscounted,
  setIsDiscounted,
  tricycleMode,
  setTricycleMode,
  busPreference,
  setBusPreference,
  trainPreference,
  setTrainPreference
}) {
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  const handleSwap = () => {
    const temp = startNode;
    setStartNode(destinationNode);
    setDestinationNode(temp);
  };

  // Convert nodes list to the format expected by SearchableDropdown
  const dropdownOptions = nodes.map(node => ({
    value: node.id,
    label: node.name
  }));

  return (
    <div className="search-container glass-card animate-fade-in" id="route-search-panel">
      <div className="search-header">
        <h2 className="section-title">Plan Your Commute</h2>
        <p className="section-subtitle">Search locations in Valenzuela & Caloocan</p>
      </div>

      <div className="search-inputs">
        <div className="input-group">
          <label htmlFor="start-node-select" className="input-label">
            Starting Point
          </label>
          <SearchableDropdown
            id="start-node-select"
            options={dropdownOptions}
            value={startNode}
            onChange={setStartNode}
            placeholder="Search starting location..."
          />
        </div>

        <div className="swap-button-container">
          <button
            type="button"
            className="swap-btn"
            onClick={handleSwap}
            aria-label="Swap starting point and destination"
            title="Swap locations"
          >
            <ArrowUpDown size={18} />
          </button>
        </div>

        <div className="input-group">
          <label htmlFor="dest-node-select" className="input-label">
            Destination
          </label>
          <SearchableDropdown
            id="dest-node-select"
            options={dropdownOptions}
            value={destinationNode}
            onChange={setDestinationNode}
            placeholder="Search destination..."
          />
        </div>
      </div>

      {/* Transport Preferences Panel */}
      <div className="preferences-wrapper">
        <button
          type="button"
          className="preferences-toggle-btn"
          onClick={() => setIsPreferencesOpen(!isPreferencesOpen)}
        >
          <span className="toggle-label-text">
            <Settings size={16} /> Fares & Transport Preferences
          </span>
          {isPreferencesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isPreferencesOpen && (
          <div className="preferences-content animate-slide-down">
            {/* Tricycle preference */}
            <div className="preference-item">
              <span className="preference-title">Tricycle Fare Mode:</span>
              <div className="preference-options-row">
                <button
                  type="button"
                  className={`pref-btn ${tricycleMode === 'shared' ? 'active' : ''}`}
                  onClick={() => setTricycleMode('shared')}
                >
                  Shared (Regular)
                </button>
                <button
                  type="button"
                  className={`pref-btn ${tricycleMode === 'special' ? 'active' : ''}`}
                  onClick={() => setTricycleMode('special')}
                >
                  Special (Solo)
                </button>
              </div>
            </div>

            {/* Bus preference */}
            <div className="preference-item">
              <span className="preference-title">Bus Class:</span>
              <div className="preference-options-row">
                <button
                  type="button"
                  className={`pref-btn ${busPreference === 'aircon' ? 'active' : ''}`}
                  onClick={() => setBusPreference('aircon')}
                >
                  Aircon Bus
                </button>
                <button
                  type="button"
                  className={`pref-btn ${busPreference === 'ordinary' ? 'active' : ''}`}
                  onClick={() => setBusPreference('ordinary')}
                >
                  Ordinary Bus
                </button>
              </div>
            </div>

            {/* Train preference */}
            <div className="preference-item">
              <span className="preference-title">Train Ticket Type:</span>
              <div className="preference-options-row">
                <button
                  type="button"
                  className={`pref-btn ${trainPreference === 'svc' ? 'active' : ''}`}
                  onClick={() => setTrainPreference('svc')}
                >
                  SVC / Beep Card
                </button>
                <button
                  type="button"
                  className={`pref-btn ${trainPreference === 'sjt' ? 'active' : ''}`}
                  onClick={() => setTrainPreference('sjt')}
                >
                  Single Ticket
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="discount-toggle-container">
        <label className="discount-toggle-label" htmlFor="discount-toggle">
          <div className="discount-info">
            <GraduationCap size={20} className="discount-icon" />
            <div className="discount-text-wrapper">
              <span className="discount-title">Concessionary Discount</span>
              <span className="discount-subtitle">20% off for Students, Seniors & PWDs</span>
            </div>
          </div>
          <div className="toggle-switch">
            <input
              type="checkbox"
              id="discount-toggle"
              checked={isDiscounted}
              onChange={(e) => setIsDiscounted(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </div>
        </label>
        <p className="discount-terms">
          *Applies to traditional jeepneys, modern jeepneys, buses, and trains.
        </p>
      </div>
    </div>
  );
}

export default memo(RouteSearch);
