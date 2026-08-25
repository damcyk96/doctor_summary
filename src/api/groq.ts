import { File } from 'expo-file-system';

const TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STT_MODEL = 'whisper-large-v3-turbo';
const LLM_MODEL = 'openai/gpt-oss-120b';

export const NOT_PROVIDED = 'nie podano';

export const SUMMARY_FIELDS = [
  { key: 'dolegliwosc', label: 'Dolegliwość' },
  { key: 'odKiedy', label: 'Od kiedy' },
  { key: 'nasilenie', label: 'Nasilenie' },
  { key: 'lokalizacja', label: 'Lokalizacja' },
  { key: 'coNasila', label: 'Co nasila' },
  { key: 'coLagodzi', label: 'Co łagodzi' },
  { key: 'leki', label: 'Przyjmowane leki' },
] as const;

export type SummaryKey = (typeof SUMMARY_FIELDS)[number]['key'];
export type Summary = Record<SummaryKey, string>;

const SYSTEM_PROMPT = `Porzadkujesz wypowiedz pacjenta przed teleporada. Twoim JEDYNYM zadaniem jest wyodrebnienie informacji, ktore pacjent wypowiedzial wprost.

ZASADY BEZWZGLEDNE:
- Nie diagnozujesz. Nie podajesz rozpoznania, przyczyny, pilnosci ani leczenia.
- Nie dodajesz informacji, ktorych nie ma w transkrypcji.
- Nie wnioskujesz i nie domyslasz sie. Jesli pacjent czegos nie powiedzial, wpisujesz doslownie "nie podano".
- Uzywasz slow pacjenta. Skracasz, ale nie interpretujesz.
- Odpowiadasz wylacznie po polsku.

Zwracasz WYLACZNIE obiekt JSON o dokladnie takich kluczach:
{
  "dolegliwosc": "glowna dolegliwosc slowami pacjenta",
  "odKiedy": "od kiedy trwa",
  "nasilenie": "nasilenie, tylko jesli pacjent je okreslil",
  "lokalizacja": "gdzie sie lokalizuje",
  "coNasila": "co pogarsza objawy",
  "coLagodzi": "co przynosi ulge",
  "leki": "przyjmowane leki"
}
Kazda wartosc to krotki tekst albo doslownie "nie podano".`;

export type Logger = (line: string) => void;

/** Zamienia surowy blad HTTP na komunikat, ktory ma sens dla pacjenta. */
function friendlyError(status: number, raw: string): string {
  if (status === 401 || status === 403) {
    return 'Klucz API został odrzucony. Sprawdź go w ustawieniach.';
  }
  if (status === 429) {
    return 'Przekroczono limit zapytań. Odczekaj chwilę i spróbuj ponownie.';
  }
  if (raw.includes('model_not_found') || raw.includes('does not exist')) {
    return `Model ${LLM_MODEL} jest niedostępny dla tego klucza.`;
  }
  if (status >= 500) {
    return 'Usługa AI chwilowo nie odpowiada. Spróbuj ponownie.';
  }
  return `Nie udało się przetworzyć nagrania (błąd ${status}).`;
}

export function describeException(error: unknown): string {
  const text = String(error);
  if (text.includes('Network request failed') || text.includes('fetch')) {
    return 'Brak połączenia z internetem.';
  }
  return text.replace(/^Error:\s*/, '');
}

export async function transcribe(file: File, apiKey: string, log: Logger): Promise<string> {
  // Globalny fetch w SDK 54+ to WinterCG fetch Expo, ktory NIE obsluguje
  // legacy-owego RN-owego {uri, name, type}. Akceptuje string, Blob albo
  // obiekt z bytes() - klasa File spelnia ten ostatni warunek.
  const form = new FormData();
  form.append('file', file as unknown as Blob);
  form.append('model', STT_MODEL);
  form.append('language', 'pl');
  form.append('response_format', 'json');

  const startedAt = Date.now();
  const response = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const raw = await response.text();
  log(`STT: HTTP ${response.status} w ${Date.now() - startedAt} ms`);

  if (!response.ok) {
    log(`STT blad: ${raw}`);
    throw new Error(friendlyError(response.status, raw));
  }

  const text = String(JSON.parse(raw).text ?? '').trim();
  log(`transkrypcja: "${text}"`);
  if (!text) {
    throw new Error('Nie udało się rozpoznać mowy. Spróbuj nagrać ponownie.');
  }
  return text;
}

export async function summarize(text: string, apiKey: string, log: Logger): Promise<Summary> {
  const startedAt = Date.now();
  const response = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transkrypcja wypowiedzi pacjenta:\n"""${text}"""` },
      ],
    }),
  });
  const raw = await response.text();
  log(`LLM: HTTP ${response.status} w ${Date.now() - startedAt} ms`);

  if (!response.ok) {
    log(`LLM blad: ${raw}`);
    throw new Error(friendlyError(response.status, raw));
  }

  const content = JSON.parse(raw).choices?.[0]?.message?.content ?? '{}';
  log(`podsumowanie: ${content}`);
  const parsed = JSON.parse(content) as Partial<Summary>;

  // Brakujacy klucz traktujemy tak samo jak brak informacji - karta nigdy
  // nie pokazuje pustego pola, ktore mozna by wziac za przeoczenie.
  return Object.fromEntries(
    SUMMARY_FIELDS.map(({ key }) => [key, parsed[key]?.trim() || NOT_PROVIDED])
  ) as Summary;
}

/** Plaski tekst do skopiowania i przekazania lekarzowi. */
export function summaryToText(summary: Summary, transcript: string): string {
  const rows = SUMMARY_FIELDS.map(({ key, label }) => `${label}: ${summary[key]}`);
  return [
    'WYWIAD PRZED TELEPORADĄ',
    '',
    ...rows,
    '',
    `Wypowiedź pacjenta: "${transcript}"`,
    '',
    'Materiał pomocniczy. Nie stanowi diagnozy ani porady medycznej.',
  ].join('\n');
}
