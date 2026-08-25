# Telemedi

## Cel MVP

Aplikacja Expo na iPhone / Expo Go do wywiadu przed teleporadą:

nagranie głosu → polska transkrypcja → zwięzłe podsumowanie dla lekarza → potwierdzenie pacjenta.

Priorytetem jest działający, przetestowany flow na fizycznym urządzeniu, nie liczba funkcji.

## Granice produktu

- Aplikacja tylko strukturyzuje wypowiedź pacjenta.
- Nie diagnozuje, nie ocenia pilności, nie sugeruje leczenia ani rozpoznań.
- Każda informacja niepowiedziana wprost przez pacjenta musi mieć wartość `nie podano`.
- Transkrypcja jest widoczna przy podsumowaniu jako źródło do weryfikacji.
- Bez historii wywiadów, kont użytkowników, backendu, weba, ręcznej edycji pól i dogrywania korekty.

## Dane i bezpieczeństwo

- Użytkownik podaje własny klucz Groq (BYOK).
- Klucz przechowuj wyłącznie w `expo-secure-store`; nigdy w kodzie, `.env` ani repozytorium.
- Audio usuń z urządzenia zaraz po udanej transkrypcji; transkrypcja i podsumowanie żyją tylko w stanie aplikacji.
- Nie dodawaj analityki ani zewnętrznego logowania.
- Nie zapisuj w dokumentacji pełnych ścieżek plików urządzenia, kluczy ani innych danych wrażliwych.

## Technologia i architektura

- Expo SDK 57; przed zmianą kodu sprawdź dokumentację Expo dla tej wersji SDK.
- Nagrywanie: `expo-audio`.
- Pliki: `expo-file-system` (`File`), nie przestarzały wzorzec RN `{ uri, name, type }` w `FormData`.
- Klucz: `expo-secure-store`.
- TTS: `expo-speech`.
- AI: Groq — STT i model czatowy.
- Modele Groq mogą się zmieniać: nie zakładaj dostępności modelu wyłącznie na podstawie dokumentacji; rzeczywistym testem jest request wykonany kluczem użytkownika.

## Zasady implementacji

- Nie rozbudowuj zakresu bez wyraźnej potrzeby.
- Najpierw napraw działający flow i obsługę błędów, potem wygląd.
- Zachowuj czytelne stany: gotowość, nagrywanie, przetwarzanie, wynik, błąd.
- Komunikaty dla pacjenta mają być po polsku i bez technicznego żargonu.
- Nie maskuj błędów „sukcesem”; nie deklaruj funkcji jako gotowej bez testu na urządzeniu.
- Diagnostyka techniczna trafia do konsoli dewelopera, nie na ekran pacjenta.
- Model czatowy jest stałą w `src/api/groq.ts`; wyboru modelu w interfejsie nie ma i nie dodajemy go.

## Weryfikacja

Po zmianach uruchom:

```bash
npx tsc --noEmit
```
