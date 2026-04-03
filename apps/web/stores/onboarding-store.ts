'use client';

import { create } from 'zustand';

export interface CompetitorEntry {
  platform: 'linkedin' | 'x';
  handle: string;
}

export interface NicheFormData {
  niche: string;
  pillars: string[];
  audience: string;
  tone: string;
  competitors: CompetitorEntry[];
  antiTopics: string[];
  examplePosts: string[];
}

export interface ValidatedProvider {
  provider: string;
  baseUrl?: string;
  capabilities: {
    web_search: boolean;
    x_search: boolean;
    image_gen: boolean;
    available_models: string[];
  };
}

export interface ModelSlotConfig {
  provider: string;
  model: string;
}

export interface AIKeysFormData {
  validatedProviders: ValidatedProvider[];
  modelConfig: {
    slotA: ModelSlotConfig | null;
    slotB: ModelSlotConfig | null;
    slotC: ModelSlotConfig | null;
    slotD: ModelSlotConfig | null;
    subAgentModel: ModelSlotConfig | null;
    captionModel: ModelSlotConfig | null;
    imageModel: ModelSlotConfig | null;
  };
}

export interface SocialConnection {
  platform: 'linkedin' | 'x';
  accountName: string;
  accountId: string;
  orgUrn?: string;
}

export interface SocialFormData {
  connections: SocialConnection[];
}

interface OnboardingStore {
  currentStep: number;
  nicheData: NicheFormData | null;
  aiKeysData: AIKeysFormData | null;
  socialData: SocialFormData | null;
  setCurrentStep: (step: number) => void;
  setNicheData: (data: NicheFormData) => void;
  setAIKeysData: (data: AIKeysFormData) => void;
  setSocialData: (data: SocialFormData) => void;
  isStepComplete: (step: number) => boolean;
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  currentStep: 1,
  nicheData: null,
  aiKeysData: null,
  socialData: null,

  setCurrentStep: (step) => set({ currentStep: step }),

  setNicheData: (data) => set({ nicheData: data }),

  setAIKeysData: (data) => set({ aiKeysData: data }),

  setSocialData: (data) => set({ socialData: data }),

  isStepComplete: (step) => {
    const state = get();
    switch (step) {
      case 1:
        return state.currentStep > 1;
      case 2:
        return state.nicheData !== null;
      case 3:
        return state.aiKeysData !== null && state.aiKeysData.validatedProviders.length > 0;
      case 4:
        return state.currentStep >= 5;
      case 5:
        return false;
      default:
        return false;
    }
  },
}));
