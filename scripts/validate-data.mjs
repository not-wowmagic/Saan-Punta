#!/usr/bin/env node
/**
 * Transit dataset validator for src/data/routes.json.
 *
 * Fails CI when the curated transit network contains structural defects.
 * This script NEVER mutates the dataset — it only reports.
 *
 * Checks:
 *   - JSON parses; root shape { nodes, legs }
 *   - Nodes: unique non-empty id, name, lat ∈ [-90,90], lng ∈ [-180,180]
 *   - Legs: unique non-empty id, from/to reference existing nodes,
 *           supported transport mode, known fare type (or null),
 *           positive distance_km, no self-referencing legs
 *   - Unknown/typo'd fields on nodes and legs are rejected
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const SUPPORTED_MODES = ['jeepney', 'tricycle', 'taxi', 'moto_taxi', 'train', 'walk', 'bus'];
const KNOWN_FARE_TYPES = ['traditional', 'modern', 'tricycle', 'taxi', 'estimate', 'ordinary', 'aircon'];

const nodeSchema = z.strictObject({
  id: z.string().min(1, 'node id must be a non-empty string'),
  name: z.string().min(1, 'node name must be a non-empty string'),
  lat: z.number().min(-90, 'latitude out of range [-90, 90]').max(90, 'latitude out of range [-90, 90]'),
  lng: z.number().min(-180, 'longitude out of range [-180, 180]').max(180, 'longitude out of range [-180, 180]')
});

const legSchema = z.strictObject({
  id: z.string().min(1, 'leg id must be a non-empty string'),
  from: z.string().min(1),
  to: z.string().min(1),
  mode: z.enum(SUPPORTED_MODES, { message: `mode must be one of: ${SUPPORTED_MODES.join(', ')}` }),
  route_name: z.string().min(1).nullable(),
  distance_km: z.number().positive('distance_km must be > 0'),
  fare_type: z.enum(KNOWN_FARE_TYPES, { message: `fare_type must be one of: ${KNOWN_FARE_TYPES.join(', ')}, or null` }).nullable(),
  notes: z.string().optional(),
  flat_fare: z.number().nonnegative().optional()
});

const datasetSchema = z.strictObject({
  _comment: z.string().optional(),
  nodes: z.array(nodeSchema),
  legs: z.array(legSchema)
});

function formatIssues(issues) {
  return issues.map((issue) => {
    const path = issue.path
      .map((seg) => (typeof seg === 'number' ? `[${seg}]` : `.${seg}`))
      .join('')
      .slice(1);
    return `${path}: ${issue.message}`;
  });
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const defaultPath = join(here, '..', 'src', 'data', 'routes.json');
  const dataPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultPath;

  let raw;
  try {
    raw = readFileSync(dataPath, 'utf8');
  } catch (err) {
    console.error(`FATAL: cannot read dataset at ${dataPath}`);
    console.error(err.message);
    process.exit(1);
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    console.error('FATAL: routes.json is not valid JSON');
    console.error(err.message);
    process.exit(1);
  }

  const result = datasetSchema.safeParse(parsedJson);
  const errors = [];

  if (!result.success) {
    errors.push(...formatIssues(result.error.issues));
  }

  const nodes = Array.isArray(parsedJson.nodes) ? parsedJson.nodes : [];
  const legs = Array.isArray(parsedJson.legs) ? parsedJson.legs : [];
  const nodeIds = new Set();
  const seenLegIds = new Set();

  for (const node of nodes) {
    if (typeof node?.id !== 'string') continue;
    if (nodeIds.has(node.id)) {
      errors.push(`nodes: duplicate node id "${node.id}"`);
    }
    nodeIds.add(node.id);
  }

  for (const leg of legs) {
    if (typeof leg?.id !== 'string') continue;
    if (seenLegIds.has(leg.id)) {
      errors.push(`legs: duplicate leg id "${leg.id}"`);
    }
    seenLegIds.add(leg.id);

    if (leg.from === leg.to && typeof leg.from === 'string') {
      errors.push(`legs["${leg.id}"]: self-referencing leg (${leg.from} → ${leg.to})`);
    }
    if (typeof leg.from === 'string' && !nodeIds.has(leg.from)) {
      errors.push(`legs["${leg.id}"]: "from" references unknown node "${leg.from}"`);
    }
    if (typeof leg.to === 'string' && !nodeIds.has(leg.to)) {
      errors.push(`legs["${leg.id}"]: "to" references unknown node "${leg.to}"`);
    }
  }

  if (errors.length > 0) {
    console.error(`✗ Transit data validation FAILED with ${errors.length} error(s):\n`);
    for (const err of errors.slice(0, 30)) {
      console.error(`  - ${err}`);
    }
    if (errors.length > 30) {
      console.error(`  ... and ${errors.length - 30} more`);
    }
    process.exit(1);
  }

  console.log(
    `✓ Transit data valid: ${nodes.length} nodes, ${legs.length} legs, ` +
    `${SUPPORTED_MODES.length} supported modes. No defects found.`
  );
}

main();
