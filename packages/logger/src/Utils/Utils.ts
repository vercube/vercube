/* eslint-disable unicorn/no-hex-escape */
import type { LoggerTypes } from '../Types/LoggerTypes';

type ColorTextFn = (text: string) => string;
const LOG_LEVEL_VALUES: Record<LoggerTypes.Level, number> = {
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

/**
 * Checks if target level is enabled.
 * @param targetLevel target level
 * @param logLevels array of enabled log levels
 */
export function isLogLevelEnabled(targetLevel: LoggerTypes.Level, currentLevel: LoggerTypes.Level): boolean {
  return LOG_LEVEL_VALUES[targetLevel] >= LOG_LEVEL_VALUES[currentLevel];
}

const isColorAllowed = () => !process.env.NO_COLOR;
const colorIfAllowed = (colorFn: ColorTextFn) => (text: string) => isColorAllowed() ? colorFn(text) : text;

export const colors = {
  bold: colorIfAllowed((text: string) => `\x1B[1m${text}\x1B[0m`),
  green: colorIfAllowed((text: string) => `\x1B[32m${text}\x1B[39m`),
  yellow: colorIfAllowed((text: string) => `\x1B[33m${text}\x1B[39m`),
  red: colorIfAllowed((text: string) => `\x1B[31m${text}\x1B[39m`),
  magentaBright: colorIfAllowed((text: string) => `\x1B[95m${text}\x1B[39m`),
  cyanBright: colorIfAllowed((text: string) => `\x1B[96m${text}\x1B[39m`),
};

export const yellow = colorIfAllowed(
  (text: string) => `\x1B[38;5;3m${text}\x1B[39m`,
);

export const LOG_LEVEL_COLORS: Record<LoggerTypes.Level, ColorTextFn> = {
  debug: colors.green,
  info: colors.bold,
  warn: colors.yellow,
  error: colors.red,
};