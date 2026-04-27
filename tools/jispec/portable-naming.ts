/**
 * Portable Naming Service
 *
 * Provides cross-platform safe naming for files, directories, and cache keys.
 * Ensures all generated names are valid on Windows, Linux, and macOS.
 *
 * Design principles:
 * - Platform-safe: no illegal characters for any OS
 * - Deterministic: same input always produces same output
 * - Readable: preserves human-readable structure where possible
 * - Reversible: encoding can be decoded when needed
 */

/**
 * Allowed character set for portable names:
 * - Lowercase letters: a-z
 * - Digits: 0-9
 * - Separators: . _ -
 */
const PORTABLE_CHAR_REGEX = /[^a-z0-9._-]/g;

/**
 * Windows reserved names (case-insensitive)
 */
const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/**
 * Convert a string to a portable segment (safe for file/directory names)
 *
 * Rules:
 * - Convert to lowercase
 * - Replace spaces with hyphens
 * - Remove/replace illegal characters
 * - Trim leading/trailing separators
 * - Handle Windows reserved names
 *
 * @param input - Input string
 * @returns Portable segment
 */
export function toPortableSegment(input: string): string {
  if (!input) {
    return 'unnamed';
  }

  // Convert to lowercase and replace spaces with hyphens
  let result = input.toLowerCase().replace(/\s+/g, '-');

  // Replace illegal characters with hyphens
  result = result.replace(PORTABLE_CHAR_REGEX, '-');

  // Collapse multiple hyphens
  result = result.replace(/-+/g, '-');

  // Trim leading/trailing separators
  result = result.replace(/^[._-]+|[._-]+$/g, '');

  // Handle empty result
  if (!result) {
    return 'unnamed';
  }

  // Check for Windows reserved names
  const baseName = result.split('.')[0];
  if (WINDOWS_RESERVED_NAMES.has(baseName)) {
    result = `_${result}`;
  }

  return result;
}

/**
 * Convert a Date to a portable timestamp string
 * Format: YYYYMMDDTHHmmssZ (ISO 8601 basic format, safe for filenames)
 *
 * Example: 2026-04-25T02:24:26.179Z → 20260425T022426Z
 *
 * @param date - Date object
 * @param includeMillis - Include milliseconds (default: false)
 * @returns Portable timestamp string
 */
export function toPortableTimestamp(date: Date, includeMillis: boolean = false): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  let timestamp = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  if (includeMillis) {
    const millis = String(date.getUTCMilliseconds()).padStart(3, '0');
    timestamp = `${year}${month}${day}T${hours}${minutes}${seconds}-${millis}ms`;
  }

  return timestamp;
}

/**
 * Parse a portable timestamp back to a Date
 *
 * @param timestamp - Portable timestamp string
 * @returns Date object
 */
export function fromPortableTimestamp(timestamp: string): Date {
  // Handle format with milliseconds: 20260425T022426-179ms
  const millisMatch = timestamp.match(/^(\d{8})T(\d{6})-(\d{3})ms$/);
  if (millisMatch) {
    const [, datePart, timePart, millis] = millisMatch;
    const isoString = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}.${millis}Z`;
    return new Date(isoString);
  }

  // Handle format without milliseconds: 20260425T022426Z
  const basicMatch = timestamp.match(/^(\d{8})T(\d{6})Z$/);
  if (basicMatch) {
    const [, datePart, timePart] = basicMatch;
    const isoString = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}.000Z`;
    return new Date(isoString);
  }

  throw new Error(`Invalid portable timestamp format: ${timestamp}`);
}

/**
 * Build a snapshot file name
 * Format: {stageId}-{timestamp}.json
 *
 * @param sliceId - Slice ID
 * @param stageId - Stage ID
 * @param timestamp - Date object
 * @returns Snapshot file name
 */
export function buildSnapshotName(sliceId: string, stageId: string, timestamp: Date): string {
  const portableStageId = toPortableSegment(stageId);
  const portableTimestamp = toPortableTimestamp(timestamp, true);
  return `${portableStageId}-${portableTimestamp}.json`;
}

/**
 * Build a report file name
 * Format: {reportType}-{sliceId}-{timestamp}.{ext}
 *
 * @param reportType - Report type (e.g., "execution", "validation")
 * @param sliceId - Slice ID
 * @param timestamp - Date object
 * @param extension - File extension (default: "json")
 * @returns Report file name
 */
export function buildReportName(
  reportType: string,
  sliceId: string,
  timestamp: Date,
  extension: string = 'json'
): string {
  const portableType = toPortableSegment(reportType);
  const portableSliceId = toPortableSegment(sliceId);
  const portableTimestamp = toPortableTimestamp(timestamp);
  return `${portableType}-${portableSliceId}-${portableTimestamp}.${extension}`;
}

/**
 * Build an evidence file name
 * Format: {sliceId}-{stageId}-{evidenceType}-{timestamp}.{ext}
 *
 * @param sliceId - Slice ID
 * @param stageId - Stage ID
 * @param evidenceType - Evidence type (e.g., "output", "error")
 * @param timestamp - Date object
 * @param extension - File extension (default: "txt")
 * @returns Evidence file name
 */
export function buildEvidenceName(
  sliceId: string,
  stageId: string,
  evidenceType: string,
  timestamp: Date,
  extension: string = 'txt'
): string {
  const portableSliceId = toPortableSegment(sliceId);
  const portableStageId = toPortableSegment(stageId);
  const portableType = toPortableSegment(evidenceType);
  const portableTimestamp = toPortableTimestamp(timestamp);
  return `${portableSliceId}-${portableStageId}-${portableType}-${portableTimestamp}.${extension}`;
}

/**
 * Build a cache key segment (for use in cache directory paths)
 * Format: {sliceId}/{stageId}/{cacheKeyHash}
 *
 * @param sliceId - Slice ID
 * @param stageId - Stage ID
 * @param cacheKeyHash - Cache key hash (without "cache:" prefix)
 * @returns Cache key segment
 */
export function buildCacheKeySegment(sliceId: string, stageId: string, cacheKeyHash: string): string {
  const portableSliceId = toPortableSegment(sliceId);
  const portableStageId = toPortableSegment(stageId);
  return `${portableSliceId}/${portableStageId}/${cacheKeyHash}`;
}

/**
 * Sanitize an ISO 8601 timestamp for use in file names
 * Replaces colons with hyphens to make it Windows-safe
 *
 * @param isoTimestamp - ISO 8601 timestamp string
 * @returns Sanitized timestamp
 * @deprecated Use toPortableTimestamp instead for new code
 */
export function sanitizeISOTimestamp(isoTimestamp: string): string {
  return isoTimestamp.replace(/:/g, '-');
}

/**
 * Validate if a string is a valid portable segment
 *
 * @param segment - String to validate
 * @returns True if valid, false otherwise
 */
export function isValidPortableSegment(segment: string): boolean {
  if (!segment) {
    return false;
  }

  // Check for illegal characters
  if (PORTABLE_CHAR_REGEX.test(segment)) {
    return false;
  }

  // Check for leading/trailing separators
  if (/^[._-]|[._-]$/.test(segment)) {
    return false;
  }

  // Check for Windows reserved names
  const baseName = segment.split('.')[0].toLowerCase();
  if (WINDOWS_RESERVED_NAMES.has(baseName)) {
    return false;
  }

  return true;
}
