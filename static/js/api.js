async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: {},
  };
  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    location.href = '/login';
    return;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  return null;
}

export const getSession = () => request('GET', '/api/session');
export const getQuotes = () => request('GET', '/api/quotes');
export const getQuote = (id) => request('GET', `/api/quotes/${id}`);
export const createQuote = (data) => request('POST', '/api/quotes', data);
export const updateQuote = (id, data) => request('PUT', `/api/quotes/${id}`, data);
export const deleteQuote = (id) => request('DELETE', `/api/quotes/${id}`);
export const getRates = () => request('GET', '/api/rates');
export const getHouse = (id) => request('GET', `/api/houses/${id}`);

export const getBookings = () => request('GET', '/api/bookings');
export const getMapData = () => request('GET', '/api/map');
export const addHouse = (form) => request('POST', '/api/houses', form);
export const moveHouse = (id, form) => request('POST', `/api/houses/${id}/move`, form);
export const deleteHouse = (id) => request('DELETE', `/api/houses/${id}`);

export const getExpenses = () => request('GET', '/api/expenses');
export const createExpense = (data) => request('POST', '/api/expenses', data);
export const deleteExpense = (id) => request('DELETE', `/api/expenses/${id}`);

export const getStats = () => request('GET', '/api/stats');
export const getSettings = () => request('GET', '/api/settings');
export const updateSettings = (data) => request('PUT', '/api/settings', data);

export const updateHouseOutcome = (id, data) => request('PATCH', `/api/houses/${id}/outcome`, data);

export const getService = (id) => request('GET', `/api/services/${id}`);
export const createService = (data) => request('POST', '/api/services', data);
export const updateService = (id, data) => request('PUT', `/api/services/${id}`, data);
export const deleteService = (id) => request('DELETE', `/api/services/${id}`);
export const completeService = (id, form) => request('POST', `/api/services/${id}/complete`, form);
export const updateHouseAddress = (id, address) => request('POST', `/api/houses/${id}/address`, {address}) ;