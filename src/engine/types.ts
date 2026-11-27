export type EntityType = 'EMAIL' | 'PHONE' | 'IP' | 'PAN' | 'AADHAAR' | 'CARD';

export const ENTITY_TYPES: readonly EntityType[] = ['EMAIL', 'PHONE', 'IP', 'PAN', 'AADHAAR', 'CARD'];

/** Human-readable names used in the UI and readout. */
export const TYPE_NAMES: Record<EntityType, string> = {
  EMAIL: 'Email',
  PHONE: 'Phone',
  IP: 'IP',
  PAN: 'PAN',
  AADHAAR: 'Aadhaar',
  CARD: 'Card',
};

export type Mode = 'full' | 'partial' | 'pseudo';

export interface Candidate {
  type: EntityType;
  start: number;
  end: number;
  raw: string;
}

export interface Match extends Candidate {
  /** Index in the sorted match list. Stable for the same text. */
  id: number;
}

export interface Rejected {
  start: number;
  end: number;
  raw: string;
  reason: 'luhn' | 'all-zero';
}

export interface Detection {
  matches: Match[];
  rejected: Rejected[];
}

export type Segment =
  | { kind: 'text'; src: [number, number] }
  | { kind: 'rejected'; src: [number, number]; reason: Rejected['reason'] }
  | {
      kind: 'match';
      id: number;
      type: EntityType;
      src: [number, number];
      out: string;
      alias?: string;
    };

export interface RedactionResult {
  segments: Segment[];
  output: string;
  /** alias → number of occurrences (pseudo mode only). */
  aliasCounts: Map<string, number>;
}
