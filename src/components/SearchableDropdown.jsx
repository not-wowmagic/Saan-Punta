import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export default function SearchableDropdown({
  id,
  options = [],
  value,
  onChange,
  placeholder = '-- Select location --'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Find the selected option's label to display in the input
  const selectedOption = options.find(opt => opt.value === value);

  // Filtered options based on search query
  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  // Synchronize search query with selected option when dropdown is closed
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        e.preventDefault();
        break;
      case 'ArrowUp':
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        e.preventDefault();
        break;
      case 'Enter':
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].value);
        }
        e.preventDefault();
        break;
      case 'Escape':
        setIsOpen(false);
        e.preventDefault();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="searchable-dropdown-container" ref={containerRef} id={`combobox-container-${id}`}>
      <div 
        className={`searchable-dropdown-control ${isOpen ? 'is-open' : ''}`}
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        <span className="dropdown-search-icon">
          <Search size={16} />
        </span>
        
        <input
          ref={inputRef}
          type="text"
          id={id}
          className="dropdown-search-input"
          placeholder={selectedOption ? selectedOption.label : placeholder}
          value={isOpen ? searchQuery : (selectedOption ? selectedOption.label : '')}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {value && !isOpen && (
          <button
            type="button"
            className="clear-dropdown-btn"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        )}

        <span className="dropdown-chevron-icon">
          <ChevronDown size={16} />
        </span>
      </div>

      {isOpen && (
        <ul className="dropdown-options-list" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <li
                  key={option.value}
                  className={`dropdown-option-item ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(option.value);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="option-label">{option.label}</span>
                  {isSelected && <span className="option-checkmark">✓</span>}
                </li>
              );
            })
          ) : (
            <li className="dropdown-no-results">No locations match your search</li>
          )}
        </ul>
      )}
    </div>
  );
}
