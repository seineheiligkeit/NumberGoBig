// sim/config.ts
//
// Counterfactual harness — toggle mechanics on/off and scale costs to
// answer "what if?" without editing game code. Configs are JSON files
// in sim/configs/ overridable per-key on the CLI. A SimConfig is
// installed via withConfig() for the duration of a single simulate()
// call; helpers in simulator.ts / catalog.ts read currentConfig() to
// branch behaviour.

import { readFileSync } from 'node:fs';

export interface SimConfig {
  /** Toggles for whole mechanics. Default: everything ON. */
  mechanics: {
    /** Cell leveling. false = levelMultiplier always 1, level entries
     *  are skipped (level upgrade purchases become no-ops). */
    cellLeveling: boolean;
    /** Per-firing ladder fuel. false = flat-cost approximation: each
     *  firing consumes 1 zero + (L−1) blocks of the cell's tier value.
     *  Use to measure how much the ladder shifted pacing. */
    ladderFuel: boolean;
    /** Warehouse capacity caps. false = pool cap is infinite — agent
     *  never needs to buy warehouses. Use to measure how much the
     *  capacity-as-progression axis matters. */
    warehouses: boolean;
    /** Comprehension gate. false = no comp gate (any value producible
     *  at any time). Mostly a debugging knob — pacing collapses. */
    comprehensionGate: boolean;
  };
  /** Per-category cost multipliers. 1.0 = unchanged. Higher = costlier. */
  costScale: {
    /** Multipliers on individual operator entry costs.
     *  Keyed by Literature id. Unkeyed entries default to 1.0. */
    operatorM: Record<string, number>;
    /** Multiplier on comprehension-upgrade costs. */
    compTier: number;
    /** Multiplier on pipe costs. */
    pipe: number;
    /** Multiplier on warehouse costs. */
    warehouse: number;
    /** Multiplier on level-up costs. */
    level: number;
  };
}

export function defaultConfig(): SimConfig {
  return {
    mechanics: {
      cellLeveling: true,
      ladderFuel: true,
      warehouses: true,
      comprehensionGate: true,
    },
    costScale: {
      operatorM: {},
      compTier: 1,
      pipe: 1,
      warehouse: 1,
      level: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Active config (module-level, single-threaded sim)
// ---------------------------------------------------------------------------
//
// The sim runs one simulation at a time per Node process. Threading a
// config through every helper would balloon signatures (resourceCost,
// ladderForCell, poolCap, currentCost, etc.) — instead we install a
// module-level "active config" for the duration of simulate().

let active: SimConfig = defaultConfig();

export function currentConfig(): SimConfig {
  return active;
}

/** Install `cfg` as the active config, run `fn`, restore the prior config. */
export function withConfig<T>(cfg: SimConfig, fn: () => T): T {
  const prev = active;
  active = cfg;
  try {
    return fn();
  } finally {
    active = prev;
  }
}

// ---------------------------------------------------------------------------
// Loading / merging
// ---------------------------------------------------------------------------

/** Deep-merge user partial onto default. Arrays / leaf primitives replace. */
export function mergeConfig(base: SimConfig, patch: PartialConfig): SimConfig {
  const out = defaultConfig();
  // Start from base, then layer patch.
  out.mechanics = { ...base.mechanics, ...(patch.mechanics ?? {}) };
  out.costScale = {
    ...base.costScale,
    ...(patch.costScale ?? {}),
    operatorM: { ...base.costScale.operatorM, ...(patch.costScale?.operatorM ?? {}) },
  };
  return out;
}

export type PartialConfig = {
  mechanics?: Partial<SimConfig['mechanics']>;
  costScale?: Partial<Omit<SimConfig['costScale'], 'operatorM'>> & {
    operatorM?: Record<string, number>;
  };
};

export function loadConfigFile(path: string): SimConfig {
  const raw = readFileSync(path, 'utf-8');
  const patch = JSON.parse(raw) as PartialConfig;
  return mergeConfig(defaultConfig(), patch);
}

/** Apply --scale key=value overrides (dotted-path mutation). */
export function applyScaleOverride(cfg: SimConfig, kv: string): SimConfig {
  const eq = kv.indexOf('=');
  if (eq < 0) throw new Error(`Bad --scale "${kv}" (expected key=value)`);
  const key = kv.slice(0, eq);
  const value = Number(kv.slice(eq + 1));
  if (!Number.isFinite(value)) throw new Error(`Bad --scale value in "${kv}"`);

  // Supported keys:
  //   compTier / pipe / warehouse / level                  → costScale.<key>
  //   operatorM.<id>                                       → costScale.operatorM[<id>]
  //   mechanics.<flag>=0|1                                 → mechanics.<flag> = !!value
  const next = structuredClone(cfg);
  if (key.startsWith('operatorM.')) {
    const id = key.slice('operatorM.'.length);
    next.costScale.operatorM[id] = value;
    return next;
  }
  if (key.startsWith('mechanics.')) {
    const flag = key.slice('mechanics.'.length) as keyof SimConfig['mechanics'];
    if (!(flag in next.mechanics)) {
      throw new Error(`Unknown mechanics flag: ${flag}`);
    }
    next.mechanics[flag] = !!value;
    return next;
  }
  const allowed = ['compTier', 'pipe', 'warehouse', 'level'] as const;
  if ((allowed as readonly string[]).includes(key)) {
    next.costScale[key as (typeof allowed)[number]] = value;
    return next;
  }
  throw new Error(`Unknown --scale key: ${key}`);
}
