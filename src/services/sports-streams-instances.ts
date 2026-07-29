// Extra "My Live Streams" panel instances the user has added for multiscreen
// viewing (each plays independently; they all read the same shared stream
// list from sports-stream-store.ts — only the player differs). Modeled on
// widget-store.ts's id-prefix + capped-array pattern. The base panel itself
// (id 'sports-streams') is registered statically in panel-layout.ts and
// never appears here — this store only tracks the *extra* instances.
import { generateId, loadFromStorage, saveToStorage } from '@/utils';
import { clearPanelColSpanEntry, clearPanelSpanEntry } from '@/utils/panel-storage';

const STORAGE_KEY = 'wm-sports-streams-instances';
const MAX_INSTANCES = 6;

export const SPORTS_STREAMS_INSTANCE_PREFIX = 'sports-streams-';

export interface SportsStreamsInstanceSpec {
  id: string;
  title: string;
  createdAt: number;
}

function materialize(raw: unknown): SportsStreamsInstanceSpec[] {
  if (!Array.isArray(raw)) return [];
  const result: SportsStreamsInstanceSpec[] = [];
  for (const candidate of raw) {
    if (
      typeof candidate !== 'object' || candidate === null ||
      typeof (candidate as Partial<SportsStreamsInstanceSpec>).id !== 'string' ||
      typeof (candidate as Partial<SportsStreamsInstanceSpec>).title !== 'string'
    ) continue;
    const spec = candidate as SportsStreamsInstanceSpec;
    result.push({ id: spec.id, title: spec.title, createdAt: typeof spec.createdAt === 'number' ? spec.createdAt : Date.now() });
  }
  return result;
}

export function loadSportsStreamsInstances(): SportsStreamsInstanceSpec[] {
  return materialize(loadFromStorage(STORAGE_KEY, []));
}

export function addSportsStreamsInstance(): SportsStreamsInstanceSpec {
  const existing = loadSportsStreamsInstances();
  const spec: SportsStreamsInstanceSpec = {
    id: `${SPORTS_STREAMS_INSTANCE_PREFIX}${generateId()}`,
    title: `My Live Streams #${existing.length + 2}`,
    createdAt: Date.now(),
  };
  const updated = [...existing, spec].slice(-MAX_INSTANCES);
  saveToStorage(STORAGE_KEY, updated);
  return spec;
}

export function removeSportsStreamsInstance(id: string): void {
  const updated = loadSportsStreamsInstances().filter(s => s.id !== id);
  saveToStorage(STORAGE_KEY, updated);
  clearPanelSpanEntry(id);
  clearPanelColSpanEntry(id);
}
