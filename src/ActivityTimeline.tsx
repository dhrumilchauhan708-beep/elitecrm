import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from './supabase';
export type Row = Record<string, any>;

export interface ActivityTimelineProps {
  leadId: string;
  lead: Row;
  acts: Row[];
  onRefresh: () => Promise<void>;
  say: (msg: string, isErr?: boolean) => void;
  fmt: (d?: string | number | Date | null) => string;
}

interface ActivityTypeOption {
  type: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  placeholder: string;
}

export const ACTIVITY_TYPE_OPTIONS: ActivityTypeOption[] = [
  {
    type: 'Note',
    label: 'Note',
    icon: 'fa-solid fa-note-sticky',
    color: '#008f8c',
    bgColor: '#e6f6f6',
    borderColor: '#bce5e4',
    placeholder: 'Write a note... (e.g. Discussed proposal, follow-up planned)'
  },
  {
    type: 'Phone',
    label: 'Phone Call',
    icon: 'fa-solid fa-phone',
    color: '#8b5cf6',
    bgColor: '#f5f3ff',
    borderColor: '#ddd6fe',
    placeholder: 'Call summary... (e.g. Spoke with decision maker, requested demo)'
  },
  {
    type: 'WhatsApp',
    label: 'WhatsApp',
    icon: 'fa-brands fa-whatsapp',
    color: '#10b981',
    bgColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    placeholder: 'WhatsApp message... (e.g. Sent brochure and pricing tier)'
  },
  {
    type: 'Email',
    label: 'Email',
    icon: 'fa-solid fa-envelope',
    color: '#0284c7',
    bgColor: '#eff6ff',
    borderColor: '#bae6fd',
    placeholder: 'Email details... (e.g. Sent contract agreement and portfolio)'
  },
  {
    type: 'Meeting',
    label: 'Meeting',
    icon: 'fa-solid fa-handshake',
    color: '#6366f1',
    bgColor: '#eef2ff',
    borderColor: '#c7d2fe',
    placeholder: 'Meeting summary... (e.g. Conducted 30-min discovery call)'
  },
  {
    type: 'LinkedIn',
    label: 'LinkedIn',
    icon: 'fa-brands fa-linkedin',
    color: '#0077b5',
    bgColor: '#e0f2fe',
    borderColor: '#bae6fd',
    placeholder: 'LinkedIn outreach... (e.g. Connected with founder, intro message)'
  },
  {
    type: 'Other',
    label: 'Other Event',
    icon: 'fa-solid fa-bolt',
    color: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    placeholder: 'What happened? (e.g. In-person expo visit, client referral)'
  }
];

export function getActivityMeta(type: string): ActivityTypeOption {
  const match = ACTIVITY_TYPE_OPTIONS.find(o => o.type.toLowerCase() === (type || '').toLowerCase());
  if (match) return match;

  const t = (type || '').toLowerCase();
  if (t === 'converted') {
    return {
      type: 'Converted',
      label: 'Converted to Client',
      icon: 'fa-solid fa-trophy',
      color: '#f59e0b',
      bgColor: '#fffbeb',
      borderColor: '#fde68a',
      placeholder: ''
    };
  }
  if (t === 'status change' || t === 'rating change') {
    return {
      type,
      label: type,
      icon: 'fa-solid fa-arrows-rotate',
      color: '#2563eb',
      bgColor: '#eff6ff',
      borderColor: '#bfdbfe',
      placeholder: ''
    };
  }
  if (t.includes('follow-up')) {
    return {
      type,
      label: type,
      icon: 'fa-solid fa-calendar-check',
      color: '#4f46e5',
      bgColor: '#eef2ff',
      borderColor: '#c7d2fe',
      placeholder: ''
    };
  }
  if (t === 'imported') {
    return {
      type: 'Imported',
      label: 'Bulk Imported',
      icon: 'fa-solid fa-file-arrow-up',
      color: '#d97706',
      bgColor: '#fffbeb',
      borderColor: '#fde68a',
      placeholder: ''
    };
  }

  return {
    type: type || 'Note',
    label: type || 'Note',
    icon: 'fa-solid fa-note-sticky',
    color: '#008f8c',
    bgColor: '#e6f6f6',
    borderColor: '#bce5e4',
    placeholder: 'Write a note...'
  };
}

function getRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 90) return '1m ago';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 7200) return '1h ago';
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActivityTimeline({ leadId, lead, acts, onRefresh, say, fmt }: ActivityTimelineProps) {
  // Activity composer states
  const [selectedType, setSelectedType] = useState<string>('Note');
  const [summary, setSummary] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentTypeMeta = useMemo(() => {
    return ACTIVITY_TYPE_OPTIONS.find(o => o.type === selectedType) || ACTIVITY_TYPE_OPTIONS[0];
  }, [selectedType]);

  // Handle logging new activity
  const handleAddActivity = async () => {
    if (!summary.trim()) {
      say('Please write a short activity summary', true);
      inputRef.current?.focus();
      return;
    }

    try {
      setIsSubmitting(true);
      const { error } = await supabase.from('activities').insert({
        lead_id: leadId,
        type: selectedType,
        summary: summary.trim(),
        details: details.trim() || null
      });

      if (error) {
        say(error.message, true);
        return;
      }

      // Update lead's last_contact_at if communication method
      if (selectedType !== 'Note') {
        await supabase.from('leads').update({
          last_contact_at: new Date().toISOString()
        }).eq('id', leadId);
      }

      setSummary('');
      setDetails('');
      setShowDetails(false);
      await onRefresh();
      say('Activity logged to timeline!');
    } catch (err: any) {
      say(err?.message || 'Failed to log activity', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle deleting an activity
  const handleDeleteActivity = async (id: string) => {
    if (!confirm('Are you sure you want to delete this activity log?')) return;
    try {
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (error) {
        say(error.message, true);
        return;
      }
      await onRefresh();
      say('Activity log deleted.');
    } catch (err: any) {
      say(err?.message || 'Failed to delete activity', true);
    }
  };

  // Copy activity content to clipboard
  const handleCopyActivity = (a: Row) => {
    const text = `${a.type}: ${a.summary}${a.details ? `\nDetails: ${a.details}` : ''} (${fmt(a.occurred_at)})`;
    navigator.clipboard.writeText(text);
    setCopiedId(a.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered activities
  const filteredActs = useMemo(() => {
    return acts.filter(a => {
      // Type category filter
      if (activeFilter !== 'ALL') {
        const t = (a.type || '').toLowerCase();
        if (activeFilter === 'NOTE' && t !== 'note') return false;
        if (activeFilter === 'PHONE' && t !== 'phone' && t !== 'call') return false;
        if (activeFilter === 'WHATSAPP' && t !== 'whatsapp') return false;
        if (activeFilter === 'EMAIL' && t !== 'email') return false;
        if (activeFilter === 'MEETING' && t !== 'meeting') return false;
        if (activeFilter === 'SYSTEM' && !['converted', 'status change', 'rating change', 'imported'].some(k => t.includes(k))) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSummary = (a.summary || '').toLowerCase().includes(q);
        const matchesType = (a.type || '').toLowerCase().includes(q);
        const matchesDetails = (a.details || '').toLowerCase().includes(q);
        if (!matchesSummary && !matchesType && !matchesDetails) return false;
      }

      return true;
    });
  }, [acts, activeFilter, searchQuery]);

  // Counts for filter pills
  const counts = useMemo(() => {
    let notes = 0, calls = 0, whatsapp = 0, emails = 0, meetings = 0, system = 0;
    acts.forEach(a => {
      const t = (a.type || '').toLowerCase();
      if (t === 'note') notes++;
      else if (t === 'phone' || t === 'call') calls++;
      else if (t === 'whatsapp') whatsapp++;
      else if (t === 'email') emails++;
      else if (t === 'meeting') meetings++;
      else if (['converted', 'status change', 'rating change', 'imported'].some(k => t.includes(k))) system++;
    });
    return { all: acts.length, notes, calls, whatsapp, emails, meetings, system };
  }, [acts]);

  return (
    <div className="card timeline-card">
      {/* Timeline Header Row */}
      <div className="timeline-header-row">
        <div className="timeline-title-group">
          <h3>
            <i className="fa-solid fa-timeline text-teal"></i> Activity Timeline
          </h3>
          <span className="card-header-badge">
            {acts.length} logged event{acts.length === 1 ? '' : 's'}
          </span>
        </div>

        {acts.length > 0 && (
          <div className="timeline-header-stats">
            <span className="timeline-stats-pill">
              <i className="fa-regular fa-clock"></i> Last: {fmt(acts[0]?.occurred_at || lead.last_contact_at)}
            </span>
          </div>
        )}
      </div>

      {/* Redesigned Activity Composer Form */}
      <div className="timeline-composer">
        <div className="timeline-composer-main">
          {/* Custom Responsive Activity Type Selector */}
          <div className="timeline-type-dropdown-wrap" ref={dropdownRef}>
            <button
              type="button"
              className="timeline-type-trigger"
              onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
              title="Select Activity Type"
              aria-label="Activity Type"
            >
              <span
                className="timeline-type-indicator"
                style={{
                  background: currentTypeMeta.bgColor,
                  color: currentTypeMeta.color,
                  borderColor: currentTypeMeta.borderColor
                }}
              >
                <i className={currentTypeMeta.icon}></i>
              </span>
              <span className="timeline-type-label">{currentTypeMeta.label}</span>
              <i className={`fa-solid fa-chevron-down timeline-type-chevron ${typeDropdownOpen ? 'open' : ''}`}></i>
            </button>

            {typeDropdownOpen && (
              <div className="timeline-type-menu">
                <div className="timeline-type-menu-header">Select Activity Type</div>
                {ACTIVITY_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.type}
                    type="button"
                    className={`timeline-type-item ${opt.type === selectedType ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedType(opt.type);
                      setTypeDropdownOpen(false);
                      inputRef.current?.focus();
                    }}
                  >
                    <div className="timeline-type-item-left">
                      <span
                        className="timeline-type-item-icon"
                        style={{
                          background: opt.bgColor,
                          color: opt.color,
                          borderColor: opt.borderColor
                        }}
                      >
                        <i className={opt.icon}></i>
                      </span>
                      <span>{opt.label}</span>
                    </div>
                    {opt.type === selectedType && (
                      <i className="fa-solid fa-check text-teal timeline-type-check"></i>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Responsive Action / Search-Like Input Bar */}
          <div className="timeline-input-wrap">
            <i
              className={`${currentTypeMeta.icon} timeline-input-icon`}
              style={{ color: currentTypeMeta.color }}
            ></i>
            <input
              ref={inputRef}
              type="text"
              className="timeline-summary-input"
              placeholder={currentTypeMeta.placeholder}
              value={summary}
              onChange={e => setSummary(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddActivity();
                }
              }}
              disabled={isSubmitting}
            />
            {summary && (
              <button
                type="button"
                className="timeline-input-clear-btn"
                onClick={() => {
                  setSummary('');
                  inputRef.current?.focus();
                }}
                title="Clear input"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          {/* Action Buttons: Expand Details & Submit */}
          <div className="timeline-composer-actions">
            <button
              type="button"
              className={`timeline-details-toggle-btn ${showDetails ? 'active' : ''}`}
              onClick={() => setShowDetails(!showDetails)}
              title={showDetails ? 'Hide details' : 'Add detailed notes or takeaways'}
            >
              <i className={`fa-solid ${showDetails ? 'fa-angle-up' : 'fa-align-left'}`}></i>
              <span className="details-toggle-text">{showDetails ? 'Hide notes' : 'Add details'}</span>
            </button>

            <button
              type="button"
              className="timeline-submit-btn"
              onClick={handleAddActivity}
              disabled={isSubmitting || !summary.trim()}
              title="Log Activity (or press Enter)"
            >
              {isSubmitting ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  <span>Logging...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-plus"></i>
                  <span>Log Activity</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Expandable Details Pane */}
        {showDetails && (
          <div className="timeline-details-pane">
            <textarea
              className="timeline-details-textarea"
              placeholder="Additional details, discussion takeaways, action items, or remarks..."
              rows={3}
              value={details}
              onChange={e => setDetails(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Live Timeline Search & Filter Toolbar */}
      {acts.length > 0 && (
        <div className="timeline-filter-toolbar">
          <div className="timeline-search-bar-row">
            <div className="timeline-search-input-wrap">
              <i className="fa-solid fa-magnifying-glass timeline-search-icon"></i>
              <input
                type="text"
                className="timeline-search-input"
                placeholder="Search logged activities by keyword or summary..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="timeline-search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>

            <div className="timeline-filter-pills">
              <button
                type="button"
                className={`timeline-filter-pill ${activeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setActiveFilter('ALL')}
              >
                All <span className="pill-count">{counts.all}</span>
              </button>
              {counts.notes > 0 && (
                <button
                  type="button"
                  className={`timeline-filter-pill ${activeFilter === 'NOTE' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('NOTE')}
                >
                  <i className="fa-solid fa-note-sticky"></i> Notes{' '}
                  <span className="pill-count">{counts.notes}</span>
                </button>
              )}
              {counts.calls > 0 && (
                <button
                  type="button"
                  className={`timeline-filter-pill ${activeFilter === 'PHONE' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('PHONE')}
                >
                  <i className="fa-solid fa-phone"></i> Calls{' '}
                  <span className="pill-count">{counts.calls}</span>
                </button>
              )}
              {counts.whatsapp > 0 && (
                <button
                  type="button"
                  className={`timeline-filter-pill ${activeFilter === 'WHATSAPP' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('WHATSAPP')}
                >
                  <i className="fa-brands fa-whatsapp"></i> WhatsApp{' '}
                  <span className="pill-count">{counts.whatsapp}</span>
                </button>
              )}
              {counts.emails > 0 && (
                <button
                  type="button"
                  className={`timeline-filter-pill ${activeFilter === 'EMAIL' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('EMAIL')}
                >
                  <i className="fa-solid fa-envelope"></i> Emails{' '}
                  <span className="pill-count">{counts.emails}</span>
                </button>
              )}
              {counts.meetings > 0 && (
                <button
                  type="button"
                  className={`timeline-filter-pill ${activeFilter === 'MEETING' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('MEETING')}
                >
                  <i className="fa-solid fa-handshake"></i> Meetings{' '}
                  <span className="pill-count">{counts.meetings}</span>
                </button>
              )}
              {counts.system > 0 && (
                <button
                  type="button"
                  className={`timeline-filter-pill ${activeFilter === 'SYSTEM' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('SYSTEM')}
                >
                  <i className="fa-solid fa-gear"></i> System{' '}
                  <span className="pill-count">{counts.system}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Redesigned Modern Timeline Stream */}
      <div className="modern-timeline-stream">
        {filteredActs.map(a => {
          const meta = getActivityMeta(a.type);
          const relTime = getRelativeTime(a.occurred_at);
          const fullTime = fmt(a.occurred_at);

          return (
            <div key={a.id} className="modern-timeline-item">
              {/* Event Icon Badge */}
              <div
                className="modern-timeline-node-icon"
                style={{
                  background: meta.bgColor,
                  color: meta.color,
                  border: `2px solid ${meta.color}`
                }}
                title={meta.label}
              >
                <i className={meta.icon}></i>
              </div>

              {/* Event Card / Bubble */}
              <div className="modern-timeline-bubble">
                <div className="timeline-bubble-top">
                  <div className="timeline-bubble-tag-group">
                    <span
                      className="timeline-type-pill"
                      style={{
                        background: meta.bgColor,
                        color: meta.color,
                        borderColor: meta.borderColor
                      }}
                    >
                      <i className={meta.icon}></i> {a.type}
                    </span>
                    {relTime && <span className="timeline-rel-badge">{relTime}</span>}
                  </div>

                  <div className="timeline-time-meta">
                    <span className="timeline-time-text" title={fullTime}>
                      <i className="fa-regular fa-clock"></i> {fullTime}
                    </span>

                    <div className="timeline-bubble-actions">
                      <button
                        type="button"
                        className="timeline-action-icon-btn"
                        onClick={() => handleCopyActivity(a)}
                        title={copiedId === a.id ? 'Copied!' : 'Copy activity'}
                      >
                        <i className={`fa-solid ${copiedId === a.id ? 'fa-check text-teal' : 'fa-copy'}`}></i>
                      </button>

                      <button
                        type="button"
                        className="timeline-action-icon-btn delete-btn"
                        onClick={() => handleDeleteActivity(a.id)}
                        title="Delete log"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="timeline-bubble-summary">{a.summary}</div>

                {a.details && (
                  <div className="timeline-bubble-details">
                    <i className="fa-solid fa-quote-left timeline-quote-icon"></i>
                    {a.details}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Empty state when no activities at all */}
        {!acts.length && (
          <div className="timeline-empty-card">
            <div className="timeline-empty-icon-box">
              <i className="fa-solid fa-timeline text-teal"></i>
            </div>
            <h4>No activity recorded yet</h4>
            <p className="mut">
              Log phone calls, WhatsApp messages, emails, notes, or meetings above to build this client's history.
            </p>
          </div>
        )}

        {/* Empty state when filter or search has 0 results */}
        {acts.length > 0 && !filteredActs.length && (
          <div className="timeline-empty-card">
            <div className="timeline-empty-icon-box">
              <i className="fa-solid fa-filter-circle-xmark text-muted"></i>
            </div>
            <h4>No matching activities found</h4>
            <p className="mut">
              Try adjusting your search query or reset the category filters.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchQuery('');
                setActiveFilter('ALL');
              }}
              style={{ marginTop: 8 }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
