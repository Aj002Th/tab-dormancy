import type { CleanupPreview, CleanupResult, StateSnapshot } from '../../shared/types';

export type PopupPhase = 'loading' | 'ready' | 'confirm' | 'running' | 'done' | 'error';

export type PopupState = {
  phase: PopupPhase;
  snapshot: StateSnapshot | null;
  preview: CleanupPreview | null;
  result: CleanupResult | null;
  error: string | null;
};

export type PopupAction =
  | { type: 'loaded'; snapshot: StateSnapshot; preview: CleanupPreview }
  | { type: 'error'; message: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'run-start' }
  | { type: 'run-done'; result: CleanupResult }
  | { type: 'reset' };

export function initialPopupState(): PopupState {
  return { phase: 'loading', snapshot: null, preview: null, result: null, error: null };
}

export function popupReducer(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case 'loaded':
      return { ...state, phase: 'ready', snapshot: action.snapshot, preview: action.preview, error: null };
    case 'error':
      return { ...state, phase: 'error', error: action.message };
    case 'confirm':
      return { ...state, phase: 'confirm' };
    case 'cancel':
      return { ...state, phase: 'ready' };
    case 'run-start':
      return { ...state, phase: 'running', error: null };
    case 'run-done':
      return { ...state, phase: 'done', result: action.result };
    case 'reset':
      return { ...state, phase: 'ready', result: null, error: null };
    default:
      return state;
  }
}
