/**
 * Station Serializer Module
 * Handles serialization and deserialization of station lists for sync operations.
 */

import { Station } from '../client/context/StationsContext';

export type DeserializeResult = Station[] | { error: string };

/**
 * Serializes a station list to JSON string.
 * @param stations - Array of stations to serialize
 * @returns JSON string representation of the station list
 */
export function serialize(stations: Station[]): string {
  return JSON.stringify(stations);
}

/**
 * Deserializes a JSON string to a station list.
 * Handles invalid JSON gracefully without throwing.
 * @param json - JSON string to deserialize
 * @returns Station array if valid, or error object if invalid
 */
export function deserialize(json: string): DeserializeResult {
  try {
    const parsed = JSON.parse(json);

    // Validate that parsed result is an array
    if (!Array.isArray(parsed)) {
      return { error: 'Invalid format: expected an array of stations' };
    }

    // Validate each station has required fields with correct types
    for (let i = 0; i < parsed.length; i++) {
      const station = parsed[i];

      if (typeof station !== 'object' || station === null) {
        return { error: `Invalid station at index ${i}: expected an object` };
      }

      if (typeof station.id !== 'string') {
        return {
          error: `Invalid station at index ${i}: missing or invalid 'id' field`,
        };
      }

      if (typeof station.name !== 'string') {
        return {
          error: `Invalid station at index ${i}: missing or invalid 'name' field`,
        };
      }

      if (typeof station.url !== 'string') {
        return {
          error: `Invalid station at index ${i}: missing or invalid 'url' field`,
        };
      }
    }

    // Return validated stations (only keeping the required fields)
    return parsed.map((s: Record<string, unknown>) => ({
      id: s.id as string,
      name: s.name as string,
      url: s.url as string,
    }));
  } catch {
    return { error: 'Invalid JSON: failed to parse' };
  }
}

/**
 * Type guard to check if a deserialize result is an error
 */
export function isDeserializeError(
  result: DeserializeResult
): result is { error: string } {
  return (
    typeof result === 'object' && 'error' in result && !Array.isArray(result)
  );
}
