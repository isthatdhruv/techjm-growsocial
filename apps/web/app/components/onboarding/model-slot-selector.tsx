'use client';

const slotDescriptions: Record<string, string> = {
  slotA: 'Slot A — Broad Web Search',
  slotB: 'Slot B — Deep Analysis',
  slotC: 'Slot C — Search-Native',
  slotD: 'Slot D — X-Native',
  subAgentModel: 'Sub-Agent (Cheapest)',
  captionModel: 'Caption Writer',
  imageModel: 'Image Generation',
};

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  replicate: 'Replicate',
};

interface ModelOption {
  provider: string;
  model: string;
}

export function ModelSlotSelector({
  slotName,
  availableModels,
  selectedModel,
  onChange,
}: {
  slotName: string;
  availableModels: ModelOption[];
  selectedModel: ModelOption | null;
  onChange: (model: ModelOption | null) => void;
}) {
  const desc = slotDescriptions[slotName] || slotName;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/3 px-3 py-2.5">
      <span className="shrink-0 text-xs font-medium text-text-muted">{desc}</span>
      <select
        value={selectedModel ? `${selectedModel.provider}::${selectedModel.model}` : ''}
        onChange={(e) => {
          if (!e.target.value) {
            onChange(null);
            return;
          }
          const [provider, model] = e.target.value.split('::');
          onChange({ provider, model });
        }}
        className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-surface-mid px-2.5 py-1.5 text-xs text-white focus:border-accent/40 focus:outline-none"
      >
        <option value="">Auto-assign</option>
        {availableModels.map((m) => (
          <option key={`${m.provider}::${m.model}`} value={`${m.provider}::${m.model}`}>
            {providerLabels[m.provider] || m.provider} — {m.model}
          </option>
        ))}
      </select>
    </div>
  );
}
