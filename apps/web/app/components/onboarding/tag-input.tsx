'use client';

import { useState } from 'react';

export function TagInput({
  tags,
  onChange,
  placeholder = 'Type and press Enter...',
  suggestions = [],
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [input, setInput] = useState('');

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  const unusedSuggestions = suggestions.filter((s) => !tags.includes(s.toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-sm text-accent"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-accent/60 hover:text-accent"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === 'Backspace' && !input && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-white placeholder:text-text-muted/40 focus:outline-none"
        />
      </div>

      {unusedSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-xs text-text-muted/50">Suggestions:</span>
          {unusedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-text-muted hover:border-white/20 hover:text-white"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
