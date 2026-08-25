# Wywiad przed teleporadą

Aplikacja Expo / React Native, w której pacjent opisuje głosem swoje dolegliwości.
Nagranie jest transkrybowane, układane w zwięzłą kartę dla lekarza i odczytywane
na głos z pytaniem „Czy dobrze zrozumiałem?".

**Aplikacja nie diagnozuje.** Porządkuje wypowiedź pacjenta i nic ponadto.

## Przepływ

```
klucz API  →  nagranie (max 90 s)  →  transkrypcja  →  kasacja audio
                                                          ↓
        potwierdzenie  ←  odczyt na głos  ←  podsumowanie dla lekarza
              ↓
     „Tak, zgadza się" → kopiowanie tekstu dla lekarza
     „Nagraj ponownie" → powrót do nagrywania
```

## Uruchomienie

```bash
npm install
```

```bash
npx expo start
```

Zeskanuj kod QR aplikacją **Expo Go**. Testowane na fizycznym iPhonie.

## Własny klucz API

Aplikacja działa w modelu BYOK — używasz własnego klucza do [Groq](https://console.groq.com).
Darmowy tier wystarcza do przetestowania całości.

Przy pierwszym uruchomieniu pojawia się ekran wpisania klucza. Klucz trafia do
`expo-secure-store` (Keychain na iOS, Keystore na Androidzie) i jest jedyną rzeczą,
którą aplikacja utrwala na urządzeniu. Zmienisz go linkiem „Zmień klucz API"
na ekranie głównym.

Klucza nie ma w repozytorium, w `.env` ani w kodzie.

## Użyte usługi

| Warstwa | Usługa |
|---|---|
| Transkrypcja | Groq `whisper-large-v3-turbo`, wymuszony język polski |
| Podsumowanie | Groq `openai/gpt-oss-120b`, `temperature: 0`, wymuszony JSON |
| Odczyt na głos | `expo-speech` — głos systemowy, na urządzeniu, bez klucza i bez kosztu |

Jeden dostawca na STT i LLM: jeden klucz, jeden dashboard, jedno miejsce awarii.

## Prywatność

- Nagranie jest kasowane z urządzenia **zaraz po transkrypcji**, zanim cokolwiek
  pojawi się na ekranie.
- Transkrypcja i podsumowanie żyją tylko w stanie aplikacji — restart je usuwa.
- Brak historii, backendu, kont i analityki.
- Ekran nagrywania informuje wprost, że nagranie jest wysyłane do zewnętrznego
  dostawcy AI.

## Co zbudowałem

Pełny przepływ **nagranie → transkrypcja → podsumowanie → potwierdzenie**,
zweryfikowany na fizycznym iPhonie, wraz z odczytem na głos.

Dwie decyzje projektowe wynikły wprost z tego, co wyszło w testach:

**Transkrypcja jest zawsze widoczna przy karcie.** W jednym z testów Whisper na
ciszy nie zwrócił pustego stringa, tylko pewnym siebie tonem wymyślił frazę
`" Dziękuję."`. Bez widocznego źródła lekarz zobaczyłby kartę zbudowaną na zdaniu,
którego pacjent nigdy nie wypowiedział.

**Model nie dopowiada danych.** Prompt jest wyłącznie ekstrakcyjny, z zakazem
diagnozy, przyczyny, oceny pilności i leczenia. Każda informacja, której pacjent
nie podał, wraca jako `nie podano` — wizualnie wyciszone, żeby nie konkurowało
z realnymi danymi. Brakujący klucz w odpowiedzi modelu też mapuje się na
`nie podano`, więc karta nigdy nie pokaże pustego pola, które można wziąć
za przeoczenie.

Szczegółowe logi z testów na urządzeniu: [docs/dziennik-testow.md](docs/dziennik-testow.md).

## Co odciąłem i dlaczego

| Odcięte | Dlaczego |
|---|---|
| **Backend / proxy dla kluczy** | Zadanie zakłada wpisywanie własnych kluczy, czyli model BYOK. Proxy to inna architektura i drugie tyle czasu. Ograniczenie opisane niżej wprost. |
| **ElevenLabs i inne cloud TTS** | `expo-speech` daje polski głos na urządzeniu, bez klucza i bez kosztu. Druga integracja to drugi klucz i drugi tryb awarii przy zerowym zysku w demo. |
| **Historia wywiadów, baza, eksport PDF** | Brak trwałości danych medycznych to decyzja projektowa, nie brakująca funkcja. |
| **Wybór modelu w interfejsie** | Powstał jako narzędzie diagnostyczne, gdy jeden z modeli Groqa okazał się wycofany. Dla pacjenta jest bezużyteczny, więc został usunięty, a model jest stałą w kodzie. |
| **Dogrywanie korekty głosem** | „Nagraj ponownie" rozwiązuje ten sam problem prościej. Druga tura z doprecyzowaniem to dodatkowa złożoność promptu i stanu. |
| **Ręczna edycja pól karty** | Klawiatura zaprzeczałaby produktowi głosowemu. |
| **Wersja web** | CORS na endpointach STT, inny format audio, klucz w `localStorage`. Podwaja pracę i nie zmienia oceny przepływu. |
| **Testy automatyczne** | Przy tym budżecie czasu wybrałem weryfikację pełnego przepływu na fizycznym urządzeniu i udokumentowanie logów. |

## Ograniczenia

- **Klucz API leży na urządzeniu i jedzie bezpośrednio do dostawcy.** Bez backendu
  nie ma tu lepszego rozwiązania. Produkcyjnie: własny proxy, klucz nigdy
  na urządzeniu.
- **Darmowe tiery dostawców AI nie mają umowy powierzenia (DPA).** Ta aplikacja
  **nie nadaje się do prawdziwych danych pacjentów**. Testowana wyłącznie na danych
  syntetycznych. Produkcyjnie: dostawca z DPA, wyłączony trening na danych,
  retencja 0, region EU.
- **Nie jest wyrobem medycznym.** Brak triażu, oceny pilności i sugestii rozpoznania
  jest celowy, nie pominięty.
- Zweryfikowane na fizycznym iPhonie w Expo Go. Androida i weba nie testowałem.
- Brak testów automatycznych. Weryfikacja była ręczna, na urządzeniu.
- Nagranie ograniczone do 90 sekund — chroni przed limitem rozmiaru pliku po
  stronie API.

## Struktura

```
App.tsx                        maszyna stanów i widoki
src/api/groq.ts                transkrypcja, podsumowanie, prompt, mapowanie błędów
src/speech.ts                  składanie zdania do odczytu, TTS
src/storage/apiKey.ts          klucz w Keychain / Keystore
src/components/SummaryCard.tsx karta dla lekarza
docs/dziennik-testow.md        logi z testów na urządzeniu
```

## Weryfikacja

```bash
npx tsc --noEmit
```
