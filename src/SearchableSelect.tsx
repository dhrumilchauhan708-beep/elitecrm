import React, { useState, useRef, useEffect } from 'react';

interface SearchableSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  id?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select or search…',
  className = '',
  id
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (opt: string) => {
    onChange(opt);
    setSearch('');
    setOpen(false);
  };

  return (
    <div className={`searchable-select-wrap ${className}`} ref={wrapRef}>
      <div
        id={id}
        className={`searchable-select-control ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className={value ? 'select-val' : 'select-placeholder'}>
          {value || placeholder}
        </span>
        <span className="select-arrow">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="searchable-select-dropdown">
          <div className="searchable-select-search-box">
            <input
              type="text"
              autoFocus
              placeholder="Type to search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="searchable-select-list">
            {filtered.length > 0 ? (
              filtered.map(opt => (
                <div
                  key={opt}
                  className={`searchable-select-item ${opt === value ? 'selected' : ''}`}
                  onClick={() => handleSelect(opt)}
                >
                  {opt}
                </div>
              ))
            ) : (
              <div className="searchable-select-no-results">No matching options</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
