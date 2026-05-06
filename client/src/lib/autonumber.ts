// Render an autonumber custom-field value from a mask + sequence number.
//
// The mask uses `#` as a digit placeholder. A run of `#` characters defines
// the zero-padded width of the sequence number. If no `#` characters are
// present in the mask, the sequence is appended as a plain integer.
//
// Examples:
//   renderAutonumber("N###", 1)       -> "N001"
//   renderAutonumber("PRJ-####", 42)  -> "PRJ-0042"
//   renderAutonumber("N", 7)          -> "N7"
//   renderAutonumber("", 7)           -> "7"
export function renderAutonumber(mask: string | null | undefined, seq: number): string {
  const m = mask ?? "";
  const match = m.match(/#+/);
  if (!match) {
    return `${m}${seq}`;
  }
  const width = match[0].length;
  const padded = String(seq).padStart(width, "0");
  return m.replace(/#+/, padded);
}
