const startColor: { r: number; g: number; b: number } = {
  r: 149,
  g: 100,
  b: 245,
}; // Purple
const endColor: { r: number; g: number; b: number } = {
  r: 111,
  g: 114,
  b: 245,
}; // Blue

// Text-style ASCII art representation of the Vercube logo
const icon: string[] = [
  '                           _          ',
  '                          | |         ',
  ' __   _____ _ __ ___ _   _| |__   ___ ',
  " \\ \\ / / _ \\ '__/ __| | | | '_ \\ / _ \\",
  String.raw`  \ V /  __/ | | (__| |_| | |_) |  __/`,
  String.raw`   \_/ \___|_|  \___|\__,_|_.__/ \___|`,
  '                                      ',
  '                                      ',
];

// Function to interpolate between two colors
function interpolateColor(
  startColor: { r: number; g: number; b: number },
  endColor: { r: number; g: number; b: number },
  factor: number,
) {
  const r = Math.round(startColor.r + factor * (endColor.r - startColor.r));
  const g = Math.round(startColor.g + factor * (endColor.g - startColor.g));
  const b = Math.round(startColor.b + factor * (endColor.b - startColor.b));

  return `\u001B[38;2;${r};${g};${b}m`;
}

// Apply gradient colors to the icon
function applyGradient(
  icon: string[],
  startColor: { r: number; g: number; b: number },
  endColor: { r: number; g: number; b: number },
) {
  const totalLines = icon.length;

  return icon
    .map((line, index) => {
      // Calculate interpolation factor based on line position
      const factor = index / (totalLines - 1);
      // Get interpolated color
      const color = interpolateColor(startColor, endColor, factor);

      return color + line;
    })
    .join('\n');
}

// Generate the final gradient-colored Vercube logo
export const vercubeIcon: string = applyGradient(icon, startColor, endColor);
