'use client';

import { useState } from 'react';

export function ChipSelect({
  options,
  selected,
  onChange,
  min: _min = 0,
  max = Infinity,
  allowCustom = false,
  label,
}: {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  min?: number;
  max?: number;
  allowCustom?: boolean;
  label?: string;
}) {
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  function toggle(item: string) {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else if (selected.length < max) {
      onChange([...selected, item]);
    }
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (trimmed && !selected.includes(trimmed) && selected.length < max) {
      onChange([...selected, trimmed]);
      setCustomInput('');
      setShowCustom(false);
    }
  }

  return (
    <div>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-text-muted">{label}</span>
          {max < Infinity && (
            <span className="text-xs text-text-muted/60">
              {selected.length}/{max} selected
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'border border-white/10 text-text-muted hover:border-white/20 hover:text-white'
              }`}
            >
              {option}
            </button>
          );
        })}

        {allowCustom && !showCustom && (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className="rounded-full border border-dashed border-white/20 px-3.5 py-1.5 text-sm text-text-muted hover:border-white/30 hover:text-white"
          >
            + Add custom
          </button>
        )}
      </div>

      {showCustom && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
            placeholder="Type custom pillar..."
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-text-muted/40 focus:border-accent/40 focus:outline-none"
            autoFocus
          />
          <button
            type="button"
            onClick={addCustom}
            className="rounded-lg bg-accent/20 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/30"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setShowCustom(false); setCustomInput(''); }}
            className="rounded-lg px-2 py-1.5 text-sm text-text-muted hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
