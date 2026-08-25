import { StyleSheet, Text, View } from 'react-native';
import { NOT_PROVIDED, SUMMARY_FIELDS, type Summary } from '../api/groq';

export function SummaryCard({ summary }: { summary: Summary }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Podsumowanie dla lekarza</Text>

      {SUMMARY_FIELDS.map(({ key, label }) => {
        const value = summary[key];
        const missing = value === NOT_PROVIDED;
        return (
          <View key={key} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={[styles.value, missing && styles.valueMissing]}>{value}</Text>
          </View>
        );
      })}

      <Text style={styles.disclaimer}>
        Materiał pomocniczy dla lekarza. Nie stanowi diagnozy ani porady medycznej.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 14,
    padding: 18,
    backgroundColor: '#fff',
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 14, color: '#1f2328' },
  row: {
    flexDirection: 'row',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e6e8eb',
  },
  label: { width: 132, fontSize: 14, color: '#57606a' },
  value: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1f2328' },
  // Brak informacji jest wizualnie wyciszony, zeby nie konkurowal
  // z tym, co pacjent faktycznie powiedzial.
  valueMissing: { fontWeight: '400', color: '#a0a6ad', fontStyle: 'italic' },
  disclaimer: { marginTop: 16, fontSize: 11, color: '#8b949e', lineHeight: 16 },
});
