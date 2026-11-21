export function validMonth(value) {
  return typeof value === "string" &&
    /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

// Accept HTML datetime-local and ISO timestamps without normalizing the input.
export function validDateTime(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match || !validDate(match[1]) || Number(match[2]) > 23 ||
      Number(match[3]) > 59 || Number(match[4] || 0) > 59) return false;
  if (match[5] && match[5] !== "Z") {
    const [hours, minutes] = match[5].slice(1).split(":").map(Number);
    if (hours > 23 || minutes > 59) return false;
  }
  return true;
}
