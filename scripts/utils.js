function getTimeZoneOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function parseUtcOffsetMinutes(timeZone) {
  const match = String(timeZone || '').match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function makeDateInTimeZone(y, m, d, hh, mm, timeZone) {
  const utcGuess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
  let offset = getTimeZoneOffsetMs(timeZone, utcGuess);
  let corrected = new Date(utcGuess.getTime() - offset);
  const offset2 = getTimeZoneOffsetMs(timeZone, corrected);
  if (offset2 !== offset) {
    corrected = new Date(utcGuess.getTime() - offset2);
  }
  return corrected;
}

function parseEventDateTime(dateStr, timeStr, timeZone) {
  if (!dateStr) return new Date(NaN);
  if (String(dateStr).includes('T')) {
    return new Date(dateStr);
  }
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  if (timeZone) {
    const offsetMinutes = parseUtcOffsetMinutes(timeZone);
    if (offsetMinutes !== null) {
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0) - offsetMinutes * 60000);
    }
    if (String(timeZone).includes('/')) {
      return makeDateInTimeZone(y, m, d, hh, mm, timeZone);
    }
  }
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
}
