const FREQUENCIES = ['daily', 'weekly', 'monthly'];

function normalizeRecurrence(input) {
  if (!input?.frequency) return null;
  const frequency = String(input.frequency);
  const interval = Number(input.interval || 1);
  const count = Number(input.count || 1);
  if (!FREQUENCIES.includes(frequency)) return { error: 'Frecuencia de recurrencia no válida' };
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) return { error: 'El intervalo debe estar entre 1 y 12' };
  if (!Number.isInteger(count) || count < 2 || count > 100) return { error: 'La serie debe tener entre 2 y 100 eventos' };
  return { frequency, interval, count };
}

function occurrenceDates(startValue, endValue, recurrence) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const dates = [];
  for (let index = 0; index < recurrence.count; index += 1) {
    const occurrenceStart = new Date(start);
    if (recurrence.frequency === 'daily') occurrenceStart.setDate(start.getDate() + index * recurrence.interval);
    if (recurrence.frequency === 'weekly') occurrenceStart.setDate(start.getDate() + index * recurrence.interval * 7);
    if (recurrence.frequency === 'monthly') occurrenceStart.setMonth(start.getMonth() + index * recurrence.interval);
    dates.push({
      startDatetime: occurrenceStart.toISOString(),
      endDatetime: new Date(occurrenceStart.getTime() + (end - start)).toISOString(),
      occurrenceIndex: index
    });
  }
  return dates;
}

module.exports = { FREQUENCIES, normalizeRecurrence, occurrenceDates };
