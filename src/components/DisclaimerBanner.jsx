import React from 'react';

export default function DisclaimerBanner({ onOpenModal }) {
  return (
    <footer className="disclaimer-footer" id="disclaimer-footer">
      <span className="disclaimer-text">
        Fares are estimates based on March 2026 LTFRB rates. MoveIt/Angkas fares are rough estimates.
      </span>
      <button 
        type="button"
        className="disclaimer-link" 
        onClick={onOpenModal}
        id="btn-reopen-disclaimer"
        aria-label="View full disclaimer details"
      >
        View Details
      </button>
    </footer>
  );
}
