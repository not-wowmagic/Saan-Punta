import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function DisclaimerModal({ isOpenOverride, onCloseOverride }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpenOverride !== undefined) {
      setIsOpen(isOpenOverride);
      return;
    }
    const accepted = localStorage.getItem('saan_punta_disclaimer_accepted');
    if (!accepted) {
      setIsOpen(true);
    }
  }, [isOpenOverride]);

  const handleAccept = () => {
    localStorage.setItem('saan_punta_disclaimer_accepted', 'true');
    setIsOpen(false);
    if (onCloseOverride) {
      onCloseOverride();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-card animate-fade-in">
        <div className="modal-header">
          <div className="modal-title-container">
            <AlertTriangle className="warning-icon-svg" size={24} style={{ color: 'var(--accent-warning)' }} />
            <h2>Disclaimer & Commuter Notice</h2>
          </div>
        </div>
        
        <div className="modal-body">
          <p className="highlight-text">
            Saan Punta is a route finding and fare estimation tool. Please read and agree to the following before planning your commute:
          </p>
          
          <ul className="disclaimer-list">
            <li>
              <strong>Estimates Only:</strong> All fares shown are estimates based on published rates as of <strong>March 2026</strong>.
            </li>
            <li>
              <strong>Variability:</strong> Fares may not reflect actual daily conditions, driver rounding, local negotiations, or future rate adjustments.
            </li>
            <li>
              <strong>Tricycle Modes:</strong> Tricycle fares can be computed using shared regular rates or special solo rates. Check your commute preferences to select the desired option.
            </li>
            <li>
              <strong>Buses and Trains:</strong> Ordinary vs. air-conditioned bus fares, and Single Journey vs. Stored Value train fares are calculated according to your selections.
            </li>
            <li>
              <strong>Motorcycle Taxis (MoveIt / Angkas):</strong> Displayed prices are <strong>rough estimates only</strong> and are not sourced from any official rate tables. Dynamic surge pricing will affect real-world costs.
            </li>
            <li>
              <strong>Manual Curation:</strong> Transit routes and locations are manually curated specifically for the <strong>Valenzuela</strong> and <strong>Caloocan</strong> areas. It does not represent a complete map of all Metro Manila transportation lines.
            </li>
          </ul>
        </div>
        
        <div className="modal-footer">
          <button className="primary-btn" onClick={handleAccept} id="btn-accept-disclaimer">
            I Understand & Agree
          </button>
        </div>
      </div>
    </div>
  );
}
