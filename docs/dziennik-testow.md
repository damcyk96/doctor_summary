# Dziennik testów

Materiał źródłowy do README. Każdy wpis to log z realnego przebiegu na urządzeniu,
nie rekonstrukcja. Ścieżki plików, identyfikatory urządzeń i identyfikatory żądań
zostały zanonimizowane.

---

## Test 1 — symulator iOS, spike uploadu

**Etap:** weryfikacja ścieżki nagranie → multipart → STT

```
--- start ---
uprawnienie mikrofonu: granted
nagrywam...
plik: file:///<sciezka-urzadzenia>/ExpoAudio/recording-<uuid>.m4a
file: name=recording-<uuid>.m4a type=audio/x-m4a size=58250B
HTTP 200 w 387 ms
odpowiedz: {"text":" Dziękuję.","x_groq":{"id":"req_<id>"}}
```

**Wynik:** łańcuch nagranie → multipart → Groq działa (HTTP 200 w 387 ms).

**Ustalenie 1 — nieaktualny przepis na upload w React Native.**
Pierwsza próba zwróciła `Unsupported FormDataPart implementation`. W Expo SDK 54+
globalny `fetch` to WinterCG fetch Expo, który **nie obsługuje** klasycznego
RN-owego `{ uri, name, type }` — przepisu obecnego w większości tutoriali.
Źródło mówi to wprost (`expo/src/winter/fetch/convertFormData.ts`): akceptowane są
tylko `string`, `Blob` i obiekt z metodą `bytes()`. Rozwiązanie: `new File(uri)`
z `expo-file-system`, które implementuje `Blob`, ma `bytes()` i samo dostarcza
`name` oraz `type` do nagłówków multipart.

**Ustalenie 2 — Whisper halucynuje na ciszy.**
Mikrofon symulatora nie wpuszczał dźwięku. Model nie zwrócił pustego stringa,
tylko pewnym siebie tonem `" Dziękuję."` — polski odpowiednik osławionego
`"Thank you."`. To bezpośrednie uzasadnienie decyzji projektowej: **transkrypcja
jest zawsze widoczna przy podsumowaniu jako źródło**. Bez niej lekarz zobaczyłby
kartę zbudowaną na zdaniu, którego pacjent nigdy nie wypowiedział.

---

## Test 2 — fizyczny telefon, blokada na modelu

**Etap:** STT zweryfikowane, krok LLM zablokowany

```
--- start ---
uprawnienie mikrofonu: granted
nagrywam...
plik: file:///<sciezka-urzadzenia>/ExpoAudio/recording-<uuid>.m4a
file: name=recording-<uuid>.m4a type=audio/x-m4a size=126180B
STT: HTTP 200 w 308 ms
transkrypcja: "Od trzech dni boli mnie gardło i mam katar."
nagranie usuniete z urzadzenia
LLM: HTTP 404 w 48 ms
LLM blad: {"error":{"message":"The model `llama-3.3-70b-versatile` does not exist
or you do not have access to it.","type":"invalid_request_error",
"code":"model_not_found"}}
```

**Wynik:** STT zweryfikowane na fizycznym urządzeniu — poprawna polska
transkrypcja w 308 ms. Kasacja nagrania wykonana przed wyświetleniem czegokolwiek.

**Ustalenie 3 — dokumentacja to nie to samo co dostępność.**
Nazwa modelu została wcześniej sprawdzona na stronie z listą modeli Groqa
i figurowała tam jako produkcyjna. Strona okazała się nieaktualna:
`llama-3.3-70b-versatile` został wycofany 16.08.2026, czyli 9 dni przed testem.
Komunikat `does not exist or you do not have access` sugerował problem
z uprawnieniami klucza — w rzeczywistości model po prostu przestał istnieć.

**Konsekwencja:** przejście na `openai/gpt-oss-120b`, jednego z następców
wskazanych przez Groqa. Model jest stałą w kodzie — wybór modelu w interfejsie
został świadomie odcięty jako funkcja diagnostyczna, nie produktowa. Jeśli model
przestanie istnieć, aplikacja pokazuje komunikat o jego niedostępności zamiast
surowego błędu HTTP.

---

## Test 3 — fizyczny telefon, pełny przepływ

**Etap:** nagranie → transkrypcja → kasacja → podsumowanie

```
STT: HTTP 200 w 304 ms
transkrypcja: "Od pięciu dni boli mnie gardło i mam katar."
nagranie usuniete z urzadzenia
LLM: HTTP 200 w 1018 ms
podsumowanie: {
  "dolegliwosc": "boli mnie gardło i mam katar",
  "odKiedy": "od pięciu dni",
  "nasilenie": "nie podano",
  "lokalizacja": "gardło",
  "coNasila": "nie podano",
  "coLagodzi": "nie podano",
  "leki": "nie podano"
}
```

**Wynik:** pełny przepływ potwierdzony na fizycznym urządzeniu. Łączny czas
odpowiedzi AI ok. 1,3 s.

**Ustalenie 4 — model nie dopowiada.**
Cztery z siedmiu pól wróciły jako `nie podano`, mimo że transkrypcja opisuje
konkretne dolegliwości. Model nie wywnioskował nasilenia z faktu, że pacjent się
skarży, ani nie wpisał leków, o których nie było mowy. To był główny test
poprawności promptu i najważniejsze ryzyko produktowe w tym zadaniu.
