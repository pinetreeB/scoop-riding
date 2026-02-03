/**
 * Date utility functions for handling various date formats
 */

/**
 * Parse date string that could be in various formats:
 * - Korean locale: "2026. 2. 4."
 * - ISO format: "2026-02-04" or "2026-02-04T12:00:00.000Z"
 * - Standard format: "2026/02/04"
 */
export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  
  // Try parsing Korean locale format "2026. 2. 4."
  const koreanMatch = dateStr.match(/(\d{4})\. (\d{1,2})\. (\d{1,2})/);
  if (koreanMatch) {
    return new Date(
      parseInt(koreanMatch[1]),
      parseInt(koreanMatch[2]) - 1,
      parseInt(koreanMatch[3])
    );
  }
  
  // Try standard Date parsing
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  return null;
}

/**
 * Format date to Korean locale string
 * @param dateStr - Date string in any format
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string or original string if parsing fails
 */
export function formatDateKorean(
  dateStr: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  }
): string {
  if (!dateStr) return "";
  
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  
  return date.toLocaleDateString("ko-KR", options);
}

/**
 * Format date to short Korean format (YYYY년 M월 D일)
 */
export function formatDateShort(dateStr: string | null | undefined): string {
  return formatDateKorean(dateStr, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format date to full Korean format with weekday
 */
export function formatDateFull(dateStr: string | null | undefined): string {
  return formatDateKorean(dateStr, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

/**
 * Format date with time
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  return formatDateKorean(dateStr, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
