import type { CleanupPreview, CleanupResult, StateSnapshot } from '../../shared/types';

export type PopupPhase = 'loading' | 'ready' | 'confirm' | 'switching' | 'running' | 'done' | 'error';

export type PopupState = {
  phase: PopupPhase;
  snapshot: StateSnapshot | null;
  preview: CleanupPreview | null;
  result: CleanupResult | null;
  error: string | null;
  switchErrorCode: string | null;
  generation: number;
};

export type PopupAction =
  | { type: 'loaded'; snapshot: StateSnapshot; preview: CleanupPreview | null; error?: string; generation: number }
  | { type: 'error'; message: string; generation: number }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'switch-start'; generation: number }
  | { type: 'switch-failed'; message: string; code?: string; generation: number }
  | { type: 'run-start' }
  | { type: 'run-done'; result: CleanupResult }
  | { type: 'reload'; generation: number };

export function initialPopupState(): PopupState {
  return {
    phase: 'loading',
    snapshot: null,
    preview: null,
    result: null,
    error: null,
    switchErrorCode: null,
    generation: 0,
  };
}

export function popupReducer(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case 'loaded':
      if (action.generation !== state.generation) return state;
      return {
        ...state,
        phase: 'ready',
        snapshot: action.snapshot,
        preview: action.preview,
        error: action.error ?? null,
        switchErrorCode: null,
      };
    case 'error':
      if (action.generation !== state.generation) return state;
      return { ...state, phase: 'error', error: action.message };
    case 'confirm':
      return { ...state, phase: 'confirm' };
    case 'cancel':
      return { ...state, phase: 'ready' };
    case 'switch-start':
      return state.phase === 'ready'
        ? { ...state, phase: 'switching', generation: action.generation, error: null, switchErrorCode: null }
        : state;
    case 'switch-failed':
      return state.phase === 'switching' && action.generation === state.generation
        ? { ...state, phase: 'ready', error: action.message, switchErrorCode: action.code ?? null }
        : state;
    case 'run-start':
      return { ...state, phase: 'running', error: null };
    case 'run-done':
      return { ...state, phase: 'done', result: action.result };
    case 'reload':
      return {
        ...state,
        phase: 'loading',
        generation: action.generation,
        result: null,
        error: null,
        switchErrorCode: null,
      };
    default:
      return state;
  }
}
