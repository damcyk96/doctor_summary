import * as Speech from 'expo-speech';
import { NOT_PROVIDED, SUMMARY_FIELDS, type Summary } from './api/groq';

export const CONFIRM_QUESTION = 'Czy dobrze zrozumiałem?';

/**
 * Sklada zdanie do odczytania wylacznie z pol, ktore pacjent faktycznie podal.
 * Czytanie na glos siedmiu razy "nie podano" byloby bezuzyteczne i dlugie.
 */
export function buildSpokenSummary(summary: Summary): string {
  const parts = SUMMARY_FIELDS.filter(({ key }) => summary[key] !== NOT_PROVIDED).map(
    ({ key, label }) => `${label}: ${summary[key]}`
  );

  if (parts.length === 0) {
    return `Nie udało mi się wychwycić szczegółów. ${CONFIRM_QUESTION}`;
  }
  return `Zrozumiałem tak. ${parts.join('. ')}. ${CONFIRM_QUESTION}`;
}

export function speak(text: string, onDone?: () => void): void {
  Speech.stop();
  Speech.speak(text, {
    language: 'pl-PL',
    rate: 0.95,
    onDone,
    onStopped: onDone,
    onError: onDone,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}
