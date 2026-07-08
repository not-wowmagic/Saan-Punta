import React from 'react';

export default function DisclaimerBanner({ onOpenModal }) {
  return (
    <div className="disclaimer-banner animate-slide-down" id="disclaimer-banner">
      <div className="disclaimer-content">
        <span className="banner-badge">NOTICE</span>
        <span className="banner-text">
          Fares are estimates based on March 2026 LTFRB rates. MoveIt/Angkas fares are rough estimates and not officially sourced.
        </span>
      </div>
      <button 
        className="text-btn text-xs" 
        onClick={onOpenModal}
        id="btn-reopen-disclaimer"
        aria-label="View full disclaimer details"
      >
        View Details ➔
      </button>
    </div>
  );
}
