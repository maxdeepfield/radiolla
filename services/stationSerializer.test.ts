/**
 * Property-Based Tests for Station Serializer
 *
 * **Feature: google-sync, Property 3: Station list serialization round-trip**
 * **Feature: google-sync, Property 4: Invalid JSON returns error**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { serialize, deserialize, isDeserializeError } from './stationSerializer';

// Generator for valid Station objects
const stationArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  url: fc.string({ minLength: 1 }),
});

// Generator for valid Station arrays
const stationListArbitrary = fc.array(stationArbitrary, { minLength: 0, maxLength: 50 });

describe('StationSerializer Property Tests', () => {
  /**
   * **Property 3: Station list serialization round-trip**
   * *For any* valid station list, serializing to JSON and then deserializing
   * SHALL produce an equivalent station list with all properties preserved.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('Property 3: serialize then deserialize produces equivalent station list', () => {
    fc.assert(
      fc.property(stationListArbitrary, (stations) => {
        // Serialize the station list
        const json = serialize(stations);

        // Deserialize the JSON
        const result = deserialize(json);

        // Result should not be an error
        expect(isDeserializeError(result)).toBe(false);

        // Result should be an array
        if (!isDeserializeError(result)) {
          // Should have the same length
          expect(result.length).toBe(stations.length);

          // Each station should have equivalent properties
          for (let i = 0; i < stations.length; i++) {
            expect(result[i].id).toBe(stations[i].id);
            expect(result[i].name).toBe(stations[i].name);
            expect(result[i].url).toBe(stations[i].url);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Property 4: Invalid JSON returns error**
   * *For any* string that is not valid JSON or does not conform to the station list schema,
   * deserializing SHALL return an error result rather than throwing an exception.
   *
   * **Validates: Requirements 6.3**
   */
  it('Property 4: invalid JSON returns error without throwing', () => {
    // Test with completely invalid JSON strings
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          // Filter to strings that are NOT valid JSON
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        (invalidJson) => {
          // Should not throw
          const result = deserialize(invalidJson);

          // Should return an error object
          expect(isDeserializeError(result)).toBe(true);
          if (isDeserializeError(result)) {
            expect(typeof result.error).toBe('string');
            expect(result.error.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4: valid JSON but invalid schema returns error', () => {
    // Test with valid JSON but invalid station schema
    const invalidSchemaArbitrary = fc.oneof(
      // Not an array
      fc.record({ foo: fc.string() }),
      // Array of non-objects (strings)
      fc.array(fc.string(), { minLength: 1 }),
      // Array of non-objects (numbers)
      fc.array(fc.integer(), { minLength: 1 }),
      // Array of objects missing required fields (at least one item)
      fc.array(fc.record({ id: fc.string() }), { minLength: 1 }), // missing name and url
      fc.array(fc.record({ name: fc.string() }), { minLength: 1 }), // missing id and url
      fc.array(fc.record({ url: fc.string() }), { minLength: 1 }), // missing id and name
      // Array with wrong types for id
      fc.array(fc.record({ id: fc.integer(), name: fc.string(), url: fc.string() }), { minLength: 1 })
    );

    fc.assert(
      fc.property(invalidSchemaArbitrary, (invalidData) => {
        const json = JSON.stringify(invalidData);

        // Should not throw
        const result = deserialize(json);

        // Should return an error object
        expect(isDeserializeError(result)).toBe(true);
        if (isDeserializeError(result)) {
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });
});
