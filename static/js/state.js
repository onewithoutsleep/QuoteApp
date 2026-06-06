let state = {
  user: null,
  rates: null,
  quotes: null,
  bookings: null,
  expenses: null,
  stats: null,
  settings: null,
  mapData: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(partial) {
  state = { ...state, ...partial };
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}