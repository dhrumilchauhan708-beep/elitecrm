import React, { useState } from 'react';
import {
  COUNTRIES,
  JOB_TITLES,
  INDUSTRIES,
  LEAD_SOURCES,
  PROMISING_REASONS,
  NOTE_OPTIONS,
  findCountry,
  parsePhone
} from './leadOptions';
import { RATINGS, STATUSES, SERVICES } from './importLogic';
import { SearchableSelect } from './SearchableSelect';

type Row = Record<string, any>;

interface LeadFormProps {
  init: Row;
  onSave: (v: Row) => void;
  onCancel: () => void;
}

export function LeadForm({ init, onSave, onCancel }: LeadFormProps) {
  // Base fields
  const [companyName, setCompanyName] = useState(init.company_name || '');
  const [contactPerson, setContactPerson] = useState(init.contact_person || '');
  const [email, setEmail] = useState(init.email || '');
  const [website, setWebsite] = useState(init.website || '');
  const [linkedinUrl, setLinkedinUrl] = useState(init.linkedin_url || '');
  const [rating, setRating] = useState(init.rating || 'Cold');
  const [status, setStatus] = useState(init.status || 'New');
  const [serviceInterest, setServiceInterest] = useState(init.service_interest || '');

  // 1. Job Title
  const initTitle = (init.job_title || '').trim();
  const titleInList = JOB_TITLES.includes(initTitle);
  const [jobTitleSelect, setJobTitleSelect] = useState(
    initTitle ? (titleInList ? initTitle : 'Other') : ''
  );
  const [customJobTitle, setCustomJobTitle] = useState(
    initTitle && !titleInList ? initTitle : ''
  );

  // 2. Country & Phone
  const initCountry = (init.country || '').trim();
  const [country, setCountry] = useState(initCountry);
  const parsedPhone = parsePhone(init.phone, initCountry);
  const [dialCode, setDialCode] = useState(parsedPhone.dialCode);
  const [localPhone, setLocalPhone] = useState(parsedPhone.localNumber);

  const handleCountryChange = (newCountryName: string) => {
    setCountry(newCountryName);
    const matched = findCountry(newCountryName);
    if (matched) {
      setDialCode(matched.dialCode);
    }
  };

  // 3. Industry
  const initIndustry = (init.industry || '').trim();
  const indInList = INDUSTRIES.includes(initIndustry);
  const [industrySelect, setIndustrySelect] = useState(
    initIndustry ? (indInList ? initIndustry : 'Other') : ''
  );
  const [customIndustry, setCustomIndustry] = useState(
    initIndustry && !indInList ? initIndustry : ''
  );

  // 4. Lead Source
  const initSource = (init.source || '').trim();
  const srcInList = LEAD_SOURCES.includes(initSource);
  const [sourceSelect, setSourceSelect] = useState(
    initSource ? (srcInList ? initSource : 'Other') : 'LinkedIn'
  );
  const [customSource, setCustomSource] = useState(
    initSource && !srcInList ? initSource : ''
  );

  // 5. Why Promising
  const initPromising = (init.promising_reason || '').trim();
  const promInList = PROMISING_REASONS.includes(initPromising);
  const [promisingSelect, setPromisingSelect] = useState(
    initPromising ? (promInList ? initPromising : 'Other') : ''
  );
  const [customPromising, setCustomPromising] = useState(
    initPromising && !promInList ? initPromising : ''
  );

  // 6. Personal Notes
  const initNotes = (init.notes || '').trim();
  const noteInList = NOTE_OPTIONS.includes(initNotes as any) && initNotes !== 'Custom Note';
  const [noteSelect, setNoteSelect] = useState(
    initNotes ? (noteInList ? initNotes : 'Custom Note') : ''
  );
  const [customNotes, setCustomNotes] = useState(
    initNotes && !noteInList ? initNotes : ''
  );

  const countryOptions = COUNTRIES.map(c => c.name);

  const callingCodeOptions = COUNTRIES.map(c => ({
    label: `${c.dialCode} (${c.name})`,
    value: c.dialCode
  }));

  const handleSave = () => {
    let finalTitle = jobTitleSelect;
    if (jobTitleSelect === 'Other') {
      finalTitle = customJobTitle.trim() || 'Other';
    }

    let finalPhone = '';
    if (localPhone.trim()) {
      finalPhone = `${dialCode} ${localPhone.trim()}`.trim();
    } else if (dialCode && dialCode !== '+91') {
      finalPhone = dialCode;
    }

    let finalIndustry = industrySelect;
    if (industrySelect === 'Other') {
      finalIndustry = customIndustry.trim() || 'Other';
    }

    let finalSource = sourceSelect;
    if (sourceSelect === 'Other') {
      finalSource = customSource.trim() || 'Other';
    }

    let finalPromising = promisingSelect;
    if (promisingSelect === 'Other') {
      finalPromising = customPromising.trim() || 'Other';
    }

    let finalNotes = noteSelect;
    if (noteSelect === 'Custom Note') {
      finalNotes = customNotes.trim();
    }

    const payload: Row = {
      ...init,
      company_name: companyName.trim(),
      contact_person: contactPerson.trim() || null,
      job_title: finalTitle || null,
      email: email.trim() || null,
      phone: finalPhone || null,
      website: website.trim() || null,
      linkedin_url: linkedinUrl.trim() || null,
      country: country.trim() || null,
      industry: finalIndustry || null,
      source: finalSource || null,
      rating,
      status,
      service_interest: serviceInterest || null,
      promising_reason: finalPromising || null,
      notes: finalNotes || null
    };

    onSave(payload);
  };

  return (
    <div className="card lead-form-card">
      <div className="lead-form-header">
        <div className="lead-form-title">
          <i className="fa-solid fa-address-card lead-form-icon"></i>
          <div>
            <h3>{init.id ? 'Edit Lead Profile' : 'Create New Lead'}</h3>
            <p className="mut">Enter lead credentials, contact specifics, and initial outreach details.</p>
          </div>
        </div>
      </div>

      <div className="form-section-title">
        <i className="fa-solid fa-building-user"></i> Core Contact Info
      </div>
      <div className="form">
        {/* Company Name */}
        <div>
          <label><i className="fa-solid fa-building"></i> Company Name <span className="req">*</span></label>
          <input
            placeholder="e.g. Acme Innovations"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
          />
        </div>

        {/* Contact Person */}
        <div>
          <label><i className="fa-solid fa-user"></i> Primary Contact Person</label>
          <input
            placeholder="e.g. John Doe"
            value={contactPerson}
            onChange={e => setContactPerson(e.target.value)}
          />
        </div>

        {/* 1. Job Title */}
        <div>
          <label><i className="fa-solid fa-briefcase"></i> Job Title</label>
          <SearchableSelect
            value={jobTitleSelect}
            onChange={val => {
              setJobTitleSelect(val);
              if (val !== 'Other') setCustomJobTitle('');
            }}
            options={JOB_TITLES}
            placeholder="Search or select job title…"
          />
          {jobTitleSelect === 'Other' && (
            <input
              style={{ marginTop: 6 }}
              placeholder="Specify custom job title…"
              value={customJobTitle}
              onChange={e => setCustomJobTitle(e.target.value)}
            />
          )}
        </div>

        {/* Email */}
        <div>
          <label><i className="fa-solid fa-envelope"></i> Email Address</label>
          <input
            type="email"
            placeholder="john@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        {/* 2. Country */}
        <div>
          <label><i className="fa-solid fa-earth-americas"></i> Country</label>
          <SearchableSelect
            value={country}
            onChange={handleCountryChange}
            options={countryOptions}
            placeholder="Search country (e.g. India, USA)…"
          />
        </div>

        {/* 2. Country Calling Code / Extension */}
        <div>
          <label><i className="fa-solid fa-hashtag"></i> Country Calling Code / Extension</label>
          <select
            className="phone-dial-select"
            value={dialCode}
            onChange={e => setDialCode(e.target.value)}
            style={{ width: '100%', height: 40 }}
          >
            {callingCodeOptions.map((opt, i) => (
              <option key={`${opt.value}-${i}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Phone Number */}
        <div>
          <label><i className="fa-solid fa-phone"></i> Phone / WhatsApp Number</label>
          <input
            className="phone-number-input"
            type="tel"
            placeholder="e.g. 98765 43210 (without country code)"
            value={localPhone}
            onChange={e => setLocalPhone(e.target.value)}
            style={{ width: '100%', height: 40 }}
          />
        </div>

        {/* Website */}
        <div>
          <label><i className="fa-solid fa-globe"></i> Website URL</label>
          <input
            placeholder="https://example.com"
            value={website}
            onChange={e => setWebsite(e.target.value)}
          />
        </div>

        {/* LinkedIn */}
        <div>
          <label><i className="fa-brands fa-linkedin"></i> LinkedIn Profile URL</label>
          <input
            placeholder="https://linkedin.com/in/profile"
            value={linkedinUrl}
            onChange={e => setLinkedinUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="form-section-title" style={{ marginTop: 20 }}>
        <i className="fa-solid fa-chart-line"></i> Sales Classification & Source
      </div>
      <div className="form">
        {/* 3. Industry */}
        <div>
          <label><i className="fa-solid fa-industry"></i> Industry Sector</label>
          <select
            value={industrySelect}
            onChange={e => {
              setIndustrySelect(e.target.value);
              if (e.target.value !== 'Other') setCustomIndustry('');
            }}
          >
            <option value="">— Select industry —</option>
            {INDUSTRIES.map(ind => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
          {industrySelect === 'Other' && (
            <input
              style={{ marginTop: 6 }}
              placeholder="Specify custom industry…"
              value={customIndustry}
              onChange={e => setCustomIndustry(e.target.value)}
            />
          )}
        </div>

        {/* 4. Lead Source */}
        <div>
          <label><i className="fa-solid fa-bullhorn"></i> Lead Source</label>
          <select
            value={sourceSelect}
            onChange={e => {
              setSourceSelect(e.target.value);
              if (e.target.value !== 'Other') setCustomSource('');
            }}
          >
            {LEAD_SOURCES.map(src => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
          {sourceSelect === 'Other' && (
            <input
              style={{ marginTop: 6 }}
              placeholder="Specify custom lead source…"
              value={customSource}
              onChange={e => setCustomSource(e.target.value)}
            />
          )}
        </div>

        {/* Rating */}
        <div>
          <label><i className="fa-solid fa-fire"></i> Priority Rating</label>
          <select value={rating} onChange={e => setRating(e.target.value)}>
            {RATINGS.map(r => (
              <option key={r} value={r}>
                {r === 'Hot' ? '🔥 Hot' : r === 'Warm' ? '☀️ Warm' : '❄️ Cold'}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label><i className="fa-solid fa-circle-notch"></i> Pipeline Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {STATUSES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Service Interest */}
        <div>
          <label><i className="fa-solid fa-layer-group"></i> Service Interest</label>
          <select
            value={serviceInterest}
            onChange={e => setServiceInterest(e.target.value)}
          >
            <option value="">— Select service —</option>
            {SERVICES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-section-title" style={{ marginTop: 20 }}>
        <i className="fa-solid fa-lightbulb"></i> Strategic Opportunity & Notes
      </div>
      <div className="form">
        {/* 5. Why Promising */}
        <div className="wide">
          <label><i className="fa-solid fa-star"></i> Why This Lead Is Promising</label>
          <select
            value={promisingSelect}
            onChange={e => {
              setPromisingSelect(e.target.value);
              if (e.target.value !== 'Other') setCustomPromising('');
            }}
          >
            <option value="">— Select why promising —</option>
            {PROMISING_REASONS.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {promisingSelect === 'Other' && (
            <input
              style={{ marginTop: 6 }}
              placeholder="Enter custom promising reason…"
              value={customPromising}
              onChange={e => setCustomPromising(e.target.value)}
            />
          )}
        </div>

        {/* 6. Personal Notes */}
        <div className="wide">
          <label><i className="fa-solid fa-clipboard-list"></i> Personal Notes / Action Stage</label>
          <select
            value={noteSelect}
            onChange={e => {
              setNoteSelect(e.target.value);
            }}
          >
            <option value="">— Select note / action stage —</option>
            {NOTE_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {noteSelect === 'Custom Note' && (
            <textarea
              style={{ marginTop: 8 }}
              rows={3}
              placeholder="Enter custom notes or specific client context…"
              value={customNotes}
              onChange={e => setCustomNotes(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="row form-actions" style={{ marginTop: 24, marginBottom: 0, gap: 14 }}>
        <button className="btn btn-primary" onClick={handleSave}>
          <i className="fa-solid fa-floppy-disk"></i> Save Lead Profile
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          <i className="fa-solid fa-xmark"></i> Cancel
        </button>
      </div>
    </div>
  );
}
