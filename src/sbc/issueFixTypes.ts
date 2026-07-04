import { TagRegistry } from './tagRegistry';

export type FixConfidence = 'high';

export interface FixContext {
  registry?: TagRegistry | null;
  modSources?: Map<string, string>;
  dataRoot?: string | null;
}

export interface ApplicableFix {
  id: string;
  title: string;
  confidence: FixConfidence;
  description?: string;
  isPreferred?: boolean;
}
