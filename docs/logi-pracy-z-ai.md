# Logi pracy z AI

Pełny zapis sesji z Claude Code, w której powstała ta aplikacja.

**Redakcja:** wiadomości są w oryginalnym brzmieniu. Zredagowano wyłącznie dane
identyfikujące urządzenie — ścieżki katalogów domowych, UUID-y urządzeń i plików
oraz identyfikatory żądań Groqa zastąpiono placeholderami. Wywołania narzędzi
(odczyty plików, `grep`, `tsc`) zapisano jako zwięzłe punkty, bo pełne wyjścia
zajęłyby wielokrotność tego dokumentu; wszystkie ustalenia z nich wynikające
są w treści.

**Kolejność pracy:** planowanie → spike na największym ryzyku → rdzeń →
interfejs → czyszczenie repo. Kod nie powstał przed decyzją o zakresie.

---

## Tura 1 — planowanie zakresu, bez kodu

### Ja

> Chcę zbudować w 1–2 godziny zadanie rekrutacyjne: aplikację Expo/React Native
> do głosowego wywiadu przed teleporadą.
>
> Najpierw nie pisz kodu. Pomóż mi:
> 1. wybrać najmniejszy działający zakres MVP,
> 2. wskazać największe ryzyka techniczne,
> 3. zaprojektować prosty przepływ użytkownika,
> 4. zdecydować, co świadomie odciąć,
> 5. przygotować kryteria „gotowe do wysłania".
>
> [treść zadania rekrutacyjnego]
>
> Chcę priorytetyzować działający przepływ: nagranie → transkrypcja →
> podsumowanie dla lekarza. TTS jest opcjonalne. Aplikacja musi pozwolić
> użytkownikowi wpisać własny klucz API. Uwzględnij prywatność danych medycznych
> i nie projektuj funkcji diagnozowania. Zadawaj mi po jednym pytaniu naraz tylko
> wtedy, gdy odpowiedź istotnie zmienia zakres.

### Claude

Zaproponował MVP: jeden ekran plus modal na klucz. Rdzeń w ~60–75 min (klucz w
SecureStore, nagrywanie z limitem 90 s, STT, LLM zwracający strukturalny JSON,
ekran wyniku z pytaniem potwierdzającym). Jako tanie dodatki wskazał `expo-speech`
zamiast ElevenLabs — polski głos na urządzeniu, bez klucza i bez kosztu.

Kluczowa decyzja architektoniczna: **jeden dostawca na STT i LLM** (Groq) —
jeden klucz, jeden dashboard, jedno miejsce awarii.

Ryzyka uszeregowane wg czasu, który potrafią zjeść:

1. Multipart upload pliku audio z React Native — wskazany jako pożeracz czasu
   numer jeden i kandydat na pierwszy spike.
2. Uprawnienia mikrofonu i tryb sesji audio na iOS.
3. Halucynacje LLM — mitygacja: wymuszony JSON, `temperature: 0`, zakaz
   wnioskowania, `"nie podano"`, transkrypcja zawsze widoczna obok podsumowania.
4. Klucz API w kliencie — bez backendu nie ma idealnego rozwiązania, do opisania
   wprost jako ograniczenie.
5. Web jako target — odradzony.

Przepływ użytkownika, lista dziewięciu rzeczy do odcięcia z uzasadnieniami,
konkretna lista wymagań prywatności (kasacja audio, zero persystencji, zero
telemetrii, brak DPA na darmowych tierach → dane syntetyczne) oraz kryteria
„gotowe do wysłania". Budżet czasu rozbity na osiem bloków, z instrukcją:
jeśli o 0:40 spike nie działa, odciąć TTS i korektę.

Zadał jedno pytanie — target demo. Wybrałem **fizyczny telefon + Expo Go**.

---

## Tura 2 — spike

### Ja

> zacznijmy od spike'u

### Claude

Działania:

- `create-expo-app` z szablonem blank-typescript, Expo SDK 57
- instalacja `expo-audio`, `expo-file-system`
- uprawnienie mikrofonu w `app.json` (iOS `NSMicrophoneUsageDescription`,
  Android `RECORD_AUDIO`, config plugin) — **przed** napisaniem UI
- odczyt typów `expo-audio` w `node_modules` zamiast polegania na pamięci;
  potwierdzone `useAudioRecorder`, `record()`, `stop()`, `uri`, oraz że preset
  `HIGH_QUALITY` daje `.m4a` na iOS i Androidzie
- spike: pole na klucz (`secureTextEntry`), przycisk nagrywania, surowy log
  odpowiedzi
- niezależna weryfikacja endpointu: `curl` z nieprawidłowym kluczem zwrócił
  `401`, co potwierdziło poprawność URL-a i nagłówka `Authorization`

Klucz wpisywany w aplikacji — nie trafia do repo ani do rozmowy.

---

## Tura 3 — porządki

### Ja

> 1) ubij serwer, postawię go lokalnie
> 2) dodaj przycisk do skopiowania log

### Claude

Ubity serwer w tle, zweryfikowany wolny port 8081. Dodany `expo-clipboard`
i przycisk „Kopiuj log" z potwierdzeniem „✓ Skopiowano"; tekst logu ustawiony
jako `selectable`.

---

## Tura 4 — pierwsza awaria: `Unsupported FormDataPart`

### Ja

```
--- start ---
uprawnienie mikrofonu: granted
nagrywam...
plik: file:///<sciezka-uzytkownika>/CoreSimulator/.../ExpoAudio/recording-<uuid>.m4a
WYJATEK: Error: Unsupported FormDataPart implementation
```

### Claude

Rozdzielił dwie rzeczy: mikrofon i nagrywanie **działały** (uprawnienie
przyznane, plik `.m4a` powstał), a upload padł **przed** wyjściem w sieć —
`WYJATEK` zamiast kodu HTTP oznaczał błąd RN/Expo, nie odpowiedź Groqa.

Zamiast zgadywać kombinacje `name`/`type`, znalazł miejsce rzucenia błędu:
`expo/src/winter/fetch/convertFormData.ts`. Komentarz w źródle mówi wprost:

> `uri` is not supported for React Native's FormData.

W Expo SDK 54+ globalny `fetch` to WinterCG fetch Expo, który przyjmuje wyłącznie
`string`, `Blob` albo obiekt z metodą `bytes()`. **Klasyczny przepis
`{ uri, name, type }`, obecny w większości tutoriali, jest w tej wersji martwy.**

Rozwiązanie: `new File(uri)` z `expo-file-system` — klasa deklaruje
`implements Blob`, ma `bytes()`, a przy okazji sama dostarcza `name` i `type`
do nagłówków multipart. Potwierdzone odczytem typów przed zmianą kodu.

Zauważył też ze ścieżki pliku, że test biegł na symulatorze, mimo wcześniejszego
wyboru fizycznego telefonu.

---

## Tura 5 — HTTP 200 i halucynacja na ciszy

### Ja

```
file: name=recording-<uuid>.m4a type=audio/x-m4a size=58250B
HTTP 200 w 387 ms
odpowiedz: {"text":" Dziękuję.","x_groq":{"id":"req_<id>"}}
```

### Claude

Spike zaliczony, ale wskazał, że `" Dziękuję."` to **nie transkrypcja, tylko
halucynacja**. 58 KB przy 128 kbps to ~3,6 s audio — plik miał długość, ale nie
miał treści. Whisper na ciszy nie zwraca pustego stringa, tylko pewnym siebie
tonem zmyśla krótką frazę; to polski odpowiednik osławionego `"Thank you."`.

Ryzyko halucynacji zmaterializowało się o warstwę niżej, niż zakładał plan —
już w STT, nie dopiero w LLM. Uznał to za bezpośrednie uzasadnienie decyzji
projektowej: **transkrypcja musi być widoczna obok podsumowania**, bo inaczej
lekarz zobaczyłby kartę zbudowaną na zdaniu, którego pacjent nigdy nie
wypowiedział.

Nie czekając na naprawę mikrofonu symulatora, dopisał krok LLM: prompt wyłącznie
ekstrakcyjny z zakazem diagnozy, `temperature: 0`, wymuszony `json_object`,
brak informacji → dosłownie `"nie podano"`. Dołożył kasację nagrania zaraz po
transkrypcji, przed pokazaniem czegokolwiek na ekranie.

Sprawdził w dokumentacji nazwy modeli i napisał: *„Ten tryb awarii odpada."*

---

## Tura 6 — model nie istnieje

### Ja

Test na fizycznym telefonie. STT działa:

```
STT: HTTP 200 w 308 ms
transkrypcja: "Od trzech dni boli mnie gardło i mam katar."
nagranie usuniete z urzadzenia
LLM: HTTP 404 w 48 ms
LLM blad: {"error":{"message":"The model `llama-3.3-70b-versatile` does not
exist or you do not have access to it.","code":"model_not_found"}}
```

Polecenia: zweryfikować realną listę modeli dostępnych dla mojego klucza,
nie zakładać, że model z dokumentacji jest dostępny dla każdego klucza, zmienić
wyłącznie konfigurację modelu i obsługę błędu, zachować ograniczenia promptu.

### Claude

Przyznał błąd wprost: sprawdził dokumentację i uznał to za dowód dostępności,
podczas gdy dokumentacja opisuje katalog, a nie uprawnienia klucza.

Sprawdził stronę deprecjacji i znalazł właściwą przyczynę — inną niż sugerował
komunikat błędu. **`llama-3.3-70b-versatile` został wycofany 16.08.2026, dziewięć
dni przed testem.** Strona z listą modeli była nieaktualna. Komunikat
`does not exist or you do not have access` mylnie kierował na problem z kluczem;
w rzeczywistości chodziło o pierwszy człon.

Zwrócił uwagę, że wskazanie następcy przez dokumentację to **ten sam rodzaj
dowodu, który przed chwilą zawiódł**, więc zamiast podmienić jedną stałą na
drugą, dodał odpytanie `GET /openai/v1/models` kluczem użytkownika — jedyne
źródło mówiące prawdę o koncie — z listą wyboru i automatycznym przełączeniem,
gdy wybrany model zniknie. Domyślnie `openai/gpt-oss-120b`.

Zapisał log testu do `docs/dziennik-testow.md` wraz z trzema ustaleniami.
Podał konkretne zdanie do nagrania, celowo niekompletne, z tabelą oczekiwanych
wartości — w tym dwoma polami-pułapkami, gdzie model mógłby dopowiedzieć dane
kliniczne.

---

## Tura 7 — działający rdzeń i przejście do wersji pokazowej

### Ja

> test przeszedł - mamy działający core (…) Wybrałem model gpt-oss-120b - więc
> możesz usunąć teraz możliwość wyboru modeli, to nie jest ważne.
> Przejdźmy teraz z technicznego spike'a do prostej, gotowej do pokazania
> aplikacji (…) Powinno być jeszcze pytanie „Czy dobrze zrozumiałem?" oraz
> odpowiedzi „Tak, zgadza się" oraz „Nagraj ponownie" oraz odczytywanie przez
> expo-speech.

Wynik testu: cztery z siedmiu pól jako `nie podano`, mimo opisanych dolegliwości.

### Claude

Usunął wybór modeli, `openai/gpt-oss-120b` jako stała. Rozbił jeden plik na
strukturę: `src/api/groq.ts`, `src/speech.ts`, `src/storage/apiKey.ts`,
`src/components/SummaryCard.tsx`, a `App.tsx` jako maszyna stanów
(`boot → setup → idle → processing → result → confirmed`).

Trzy decyzje podjęte po drodze:

- **TTS czyta tylko wypełnione pola** — odczytanie siedmiu razy „nie podano"
  byłoby bezużyteczne i długie.
- **Sesja audio przełączana przed odczytem** — na iOS `allowsRecording: true`
  kieruje dźwięk do słuchawki, więc bez `setAudioModeAsync({ allowsRecording:
  false })` po nagraniu TTS byłby ledwo słyszalny. Pułapka złapana z wyprzedzeniem,
  nie po fakcie.
- **Log techniczny schowany, nie usunięty** — zwijany, z kopiowaniem.

Klucz przeniesiony do `expo-secure-store`, żeby przeżywał restart. Dodatkowo:
`nie podano` wyciszone wizualnie, brakujący klucz w odpowiedzi modelu mapowany
na `nie podano`, twardy limit 90 s z automatycznym zatrzymaniem.

Po napisaniu sam wychwycił, że zostawił `require()` wewnątrz komponentu zamiast
importu, i poprawił.

---

## Tura 8 — ocena własnej pracy

### Ja

> jak na ten moment oceniasz konwersacje z AI?

### Claude

Ocena z wyszczególnieniem własnych błędów.

Mocne strony: kolejność (zakres przed kodem), diagnoza `Unsupported FormDataPart`
przez odczyt źródła zamiast zgadywania, przekucie halucynacji `" Dziękuję."`
w decyzję produktową, prywatność jako zachowanie aplikacji, nie akapit w README.

Najsłabszy moment — sprawa modelu. Dwa osobne błędy, z czego drugi gorszy:

1. Sprawdzenie niewłaściwego źródła (lista modeli zamiast strony deprecjacji).
2. **Ogłoszenie pewności, której nie było.** Sformułowanie „ten tryb awarii
   odpada" było nadinterpretacją dowodu. Przy ostrożniejszym sformułowaniu
   `404` byłoby przewidzianym scenariuszem, a nie blokerem.

Błąd wychwycił człowiek, nie model.

Drobniejsze: picker modeli zbudowany ponad prośbę i skasowany turę później,
`require()` w komponencie, przeoczenie że test biegł na symulatorze.

Wskazał też, czego w logach brakuje: **ani razu nie uruchomił aplikacji**.
Każde „działa" pochodzi z urządzenia użytkownika i wklejonego przez niego logu;
weryfikacja po stronie modelu była wyłącznie statyczna — `tsc`, odczyt źródeł,
`curl` na endpoint.

---

## Tura 9 — czyszczenie repo

### Ja

> Aplikacja działa na fizycznym telefonie (…) Przejrzyj projekt i wykonaj tylko
> bezpieczne prace: [audyt sekretów, `.gitignore`, martwy kod, spójność
> dokumentacji, anonimizacja logów, README, `tsc`]. Nie rób refaktoru dla samego
> refaktoru ani nie dodawaj nowych funkcji.

### Claude

Audyt przed zmianami. Sekrety: zero trafień w drzewie roboczym i w historii
gita. Zależności: wszystkie sześć używanych. Martwy kod: `tsc` z
`--noUnusedLocals --noUnusedParameters` czysto.

**Znaleziona luka bezpieczeństwa:** `.gitignore` miał wzorzec `.env*.local`,
który ignoruje `.env.local`, ale **nie ignoruje zwykłego `.env`**. Plik
z sekretem wszedłby do commita. Naprawione i zweryfikowane przez
`git check-ignore`, nie „na oko".

Pozostałe zmiany: usunięty log debugowy z interfejsu (diagnostyka do konsoli
dev pod `__DEV__`), naprawiony `AGENTS.md` importujący sam siebie, anonimizacja
dziennika testów, **usunięcie z dokumentacji opisu nieistniejącej funkcji** —
dziennik nadal twierdził, że aplikacja pozwala wybrać model, choć funkcja została
skasowana turę wcześniej. Napisany README.

Każde twierdzenie z README sprawdzone przeciwko kodowi: limit 90 s, nazwy modeli,
`temperature: 0`, wymuszony JSON, język `pl`, teksty przycisków, kasacja audio,
SecureStore.

---

## Tura 10 — commity i publikacja

### Ja

> przygotuj commity z sensownym podziałem, git origin został już dodany
> w międzyczasie, na końcu zrób push i wygeneruj pełne logi rozmowy do .md

### Claude

Podział na commity według warstw: konfiguracja → integracja z API →
przechowywanie klucza → TTS → komponent karty → przepływ aplikacji →
dokumentacja. Ten plik.

---

## Co z tej sesji wynika dla samego produktu

Trzy rzeczy w kodzie istnieją **dlatego, że coś poszło nie tak w trakcie**,
a nie dlatego, że były w planie:

| Element | Powód |
|---|---|
| Transkrypcja widoczna przy karcie | Whisper zmyślił `" Dziękuję."` na ciszy |
| `new File(uri)` zamiast `{ uri, name, type }` | WinterCG fetch w SDK 54+ nie przyjmuje starego wzorca |
| Czytelny komunikat przy niedostępnym modelu | Model wycofano 9 dni przed testem |

Dwie rzeczy z planu nie przetrwały zderzenia z rzeczywistością: wybór modelu
w interfejsie (zbudowany, potem odcięty jako narzędzie diagnostyczne, nie
produktowe) oraz dogrywanie korekty głosem (odcięte na rzecz prostszego
„Nagraj ponownie").
