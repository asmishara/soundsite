export function formatDb(db: number): string {
  return db <= -59.5 ? '-∞ dB' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`
}
