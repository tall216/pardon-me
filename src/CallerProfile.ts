import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CallerProfile {
  id: string;
  name: string;
  photoUri?: string;
}

const DEFAULT_PRESETS: CallerProfile[] = [
  { id: 'default', name: 'Michael' },
  { id: 'boss', name: 'The Boss' },
  { id: 'spouse', name: 'Wife' },
  { id: 'emergency', name: 'Emergency' },
];

let currentProfile: CallerProfile = DEFAULT_PRESETS[0];
let presets: CallerProfile[] = [...DEFAULT_PRESETS];

export function getCaller(): CallerProfile {
  return currentProfile;
}

export async function setCaller(profile: Partial<CallerProfile>): Promise<void> {
  currentProfile = { ...currentProfile, ...profile };
  await AsyncStorage.setItem('pardonme_current_caller', JSON.stringify(currentProfile));
}

export async function getPresets(): Promise<CallerProfile[]> {
  const stored = await AsyncStorage.getItem('pardonme_presets');
  return stored ? JSON.parse(stored) : presets;
}

export async function addPreset(profile: CallerProfile): Promise<void> {
  presets.push(profile);
  await AsyncStorage.setItem('pardonme_presets', JSON.stringify(presets));
}

export async function loadSavedProfile(): Promise<void> {
  const stored = await AsyncStorage.getItem('pardonme_current_caller');
  if (stored) {
    currentProfile = JSON.parse(stored);
  }
}
