import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

import {
  describeException,
  summarize,
  summaryToText,
  transcribe,
  type Summary,
} from './src/api/groq';
import { clearApiKey, loadApiKey, saveApiKey } from './src/storage/apiKey';
import { buildSpokenSummary, CONFIRM_QUESTION, speak, stopSpeaking } from './src/speech';
import { SummaryCard } from './src/components/SummaryCard';

const MAX_SECONDS = 90;

type Phase = 'boot' | 'setup' | 'idle' | 'processing' | 'result' | 'confirmed';
type Stage = 'transcribing' | 'summarizing';

const STAGE_LABEL: Record<Stage, string> = {
  transcribing: 'Zapisuję, co powiedziałeś…',
  summarizing: 'Układam podsumowanie…',
};

export default function App() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [phase, setPhase] = useState<Phase>('boot');
  const [apiKey, setApiKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [stage, setStage] = useState<Stage>('transcribing');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  const stoppingRef = useRef(false);
  // Diagnostyka trafia wylacznie do konsoli dewelopera. Pacjent widzi
  // komunikaty po polsku, nie surowe odpowiedzi HTTP.
  const append = useCallback((line: string) => {
    if (__DEV__) console.log(`[wywiad] ${line}`);
  }, []);

  useEffect(() => {
    loadApiKey().then((stored) => {
      if (stored) setApiKey(stored);
      setPhase(stored ? 'idle' : 'setup');
    });
  }, []);

  useEffect(() => stopSpeaking, []);

  async function handleSaveKey() {
    const value = keyDraft.trim();
    if (!value) return;
    await saveApiKey(value);
    setApiKey(value);
    setKeyDraft('');
    setError(null);
    setPhase('idle');
  }

  async function handleForgetKey() {
    await clearApiKey();
    setApiKey('');
    setPhase('setup');
  }

  async function startRecording() {
    setError(null);
    setTranscript('');
    setSummary(null);
    stopSpeaking();

    const permission = await requestRecordingPermissionsAsync();
    append(`uprawnienie mikrofonu: ${permission.status}`);
    if (!permission.granted) {
      setError('Bez dostępu do mikrofonu nie nagram wypowiedzi.');
      return;
    }

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    stoppingRef.current = false;
    recorder.record();
  }

  const stopAndProcess = useCallback(async () => {
    await recorder.stop();
    // Na iOS tryb nagrywania kieruje dzwiek do sluchawki - bez tego
    // przelaczenia pozniejszy odczyt TTS jest ledwo slyszalny.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

    const uri = recorder.uri;
    if (!uri) {
      setError('Nagranie się nie zapisało. Spróbuj ponownie.');
      return;
    }

    setPhase('processing');
    setStage('transcribing');

    const file = new File(uri);
    append(`plik: ${file.name} ${file.type || '?'} ${file.size}B`);

    try {
      const text = await transcribe(file, apiKey, append);

      // Prywatnosc: nagranie znika natychmiast po transkrypcji,
      // zanim cokolwiek pojawi sie na ekranie.
      file.delete();
      append('nagranie usuniete z urzadzenia');

      setTranscript(text);
      setStage('summarizing');

      const result = await summarize(text, apiKey, append);
      setSummary(result);
      setPhase('result');

      setSpeaking(true);
      speak(buildSpokenSummary(result), () => setSpeaking(false));
    } catch (e) {
      try {
        file.delete();
      } catch {
        // plik mogl juz zostac usuniety - blad kasowania nie moze
        // przeslonic wlasciwej przyczyny awarii
      }
      append(`WYJATEK: ${String(e)}`);
      setError(describeException(e));
      setPhase('idle');
    }
  }, [apiKey, append, recorder]);

  // Twardy limit dlugosci - chroni przed limitem rozmiaru pliku po stronie API
  // i przed monologiem, ktorego i tak nikt nie przeczyta.
  useEffect(() => {
    if (
      recorderState.isRecording &&
      !stoppingRef.current &&
      recorderState.durationMillis >= MAX_SECONDS * 1000
    ) {
      stoppingRef.current = true;
      void stopAndProcess();
    }
  }, [recorderState.isRecording, recorderState.durationMillis, stopAndProcess]);

  function replay() {
    if (!summary) return;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(buildSpokenSummary(summary), () => setSpeaking(false));
  }

  function recordAgain() {
    stopSpeaking();
    setSpeaking(false);
    setSummary(null);
    setTranscript('');
    setPhase('idle');
  }

  async function copyForDoctor() {
    if (!summary) return;
    await Clipboard.setStringAsync(summaryToText(summary, transcript));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const seconds = Math.floor(recorderState.durationMillis / 1000);
  const remaining = MAX_SECONDS - seconds;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        {phase === 'boot' ? <ActivityIndicator style={styles.boot} /> : null}

        {phase === 'setup' ? (
          <View>
            <Text style={styles.h1}>Zanim zaczniemy</Text>
            <Text style={styles.lead}>
              Aplikacja korzysta z Twojego własnego klucza API do Groq. Klucz zostaje na tym
              urządzeniu, w bezpiecznym magazynie systemowym.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="gsk_..."
              placeholderTextColor="#a0a6ad"
              value={keyDraft}
              onChangeText={setKeyDraft}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Pressable
              style={[styles.primary, !keyDraft.trim() && styles.primaryDisabled]}
              onPress={handleSaveKey}
              disabled={!keyDraft.trim()}
            >
              <Text style={styles.primaryText}>Zapisz klucz</Text>
            </Pressable>
            <Text style={styles.note}>
              Klucz utworzysz na console.groq.com. Darmowy tier wystarcza do przetestowania
              aplikacji.
            </Text>
          </View>
        ) : null}

        {phase === 'idle' ? (
          <View>
            <Text style={styles.h1}>Wywiad przed teleporadą</Text>
            <Text style={styles.lead}>
              Opowiedz własnymi słowami, co Ci dolega i od kiedy. Przygotuję z tego zwięzłe
              podsumowanie dla lekarza.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.recordArea}>
              <Pressable
                style={[styles.recordButton, recorderState.isRecording && styles.recordButtonActive]}
                onPress={recorderState.isRecording ? stopAndProcess : startRecording}
              >
                <Text style={styles.recordButtonText}>
                  {recorderState.isRecording ? 'Zakończ' : 'Nagraj'}
                </Text>
              </Pressable>

              <Text style={styles.timer}>
                {recorderState.isRecording
                  ? `Nagrywam · pozostało ${remaining}s`
                  : `Maksymalnie ${MAX_SECONDS} sekund`}
              </Text>
            </View>

            <Text style={styles.privacy}>
              Nagranie jest wysyłane do zewnętrznego dostawcy AI w celu transkrypcji i kasowane
              z urządzenia zaraz po niej. Aplikacja nie zapisuje historii. To nie jest diagnoza.
            </Text>

            <Pressable onPress={handleForgetKey} hitSlop={8}>
              <Text style={styles.link}>Zmień klucz API</Text>
            </Pressable>
          </View>
        ) : null}

        {phase === 'processing' ? (
          <View style={styles.processing}>
            <ActivityIndicator size="large" />
            <Text style={styles.stageText}>{STAGE_LABEL[stage]}</Text>
            <Text style={styles.stageHint}>
              {stage === 'transcribing' ? 'Krok 1 z 2' : 'Krok 2 z 2'}
            </Text>
          </View>
        ) : null}

        {(phase === 'result' || phase === 'confirmed') && summary ? (
          <View>
            <Text style={styles.h1}>
              {phase === 'confirmed' ? 'Gotowe' : 'Sprawdź, czy się zgadza'}
            </Text>

            {phase === 'confirmed' ? (
              <Text style={styles.lead}>
                Podsumowanie potwierdzone. Możesz je skopiować i przekazać lekarzowi.
              </Text>
            ) : null}

            <SummaryCard summary={summary} />

            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>Twoja wypowiedź (źródło)</Text>
              <Text selectable style={styles.transcriptText}>
                „{transcript}"
              </Text>
            </View>

            {phase === 'result' ? (
              <View>
                <Pressable style={styles.replay} onPress={replay} hitSlop={8}>
                  <Text style={styles.replayText}>
                    {speaking ? '■ Zatrzymaj odczyt' : '▶ Odczytaj ponownie'}
                  </Text>
                </Pressable>

                <Text style={styles.question}>{CONFIRM_QUESTION}</Text>

                <Pressable style={styles.primary} onPress={() => setPhase('confirmed')}>
                  <Text style={styles.primaryText}>Tak, zgadza się</Text>
                </Pressable>
                <Pressable style={styles.secondary} onPress={recordAgain}>
                  <Text style={styles.secondaryText}>Nagraj ponownie</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <Pressable style={styles.primary} onPress={copyForDoctor}>
                  <Text style={styles.primaryText}>
                    {copied ? '✓ Skopiowano' : 'Kopiuj dla lekarza'}
                  </Text>
                </Pressable>
                <Pressable style={styles.secondary} onPress={recordAgain}>
                  <Text style={styles.secondaryText}>Nowy wywiad</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f8fa' },
  content: { padding: 22, paddingTop: 76, paddingBottom: 60 },
  boot: { marginTop: 80 },

  h1: { fontSize: 26, fontWeight: '700', color: '#1f2328', marginBottom: 10 },
  lead: { fontSize: 15, lineHeight: 22, color: '#57606a', marginBottom: 24 },
  note: { fontSize: 12, lineHeight: 17, color: '#8b949e', marginTop: 16 },
  link: { fontSize: 13, color: '#1f6feb', fontWeight: '600', marginTop: 20 },

  input: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    backgroundColor: '#fff',
    marginBottom: 14,
  },

  primary: {
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryDisabled: { backgroundColor: '#b6c6e3' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#fff',
  },
  secondaryText: { color: '#1f2328', fontSize: 16, fontWeight: '600' },

  recordArea: { alignItems: 'center', marginVertical: 20 },
  recordButton: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: '#1f6feb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonActive: { backgroundColor: '#d1242f' },
  recordButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  timer: { marginTop: 16, fontSize: 14, color: '#57606a' },

  privacy: { fontSize: 12, lineHeight: 18, color: '#8b949e', marginTop: 12 },

  errorBox: {
    backgroundColor: '#ffeef0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
  },
  errorText: { color: '#a40e26', fontSize: 14, lineHeight: 20 },

  processing: { alignItems: 'center', paddingVertical: 90 },
  stageText: { marginTop: 22, fontSize: 17, fontWeight: '600', color: '#1f2328' },
  stageHint: { marginTop: 6, fontSize: 13, color: '#8b949e' },

  transcriptBox: {
    backgroundColor: '#eef1f4',
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  transcriptLabel: { fontSize: 12, fontWeight: '600', color: '#57606a' },
  transcriptText: { fontSize: 14, lineHeight: 20, color: '#1f2328', marginTop: 6, fontStyle: 'italic' },

  replay: { alignItems: 'center', paddingVertical: 16 },
  replayText: { fontSize: 14, fontWeight: '600', color: '#1f6feb' },

  question: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1f2328',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },

});
