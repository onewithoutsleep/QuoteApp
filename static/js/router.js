export function navigate(hash) {
  if (!hash.startsWith('#')) hash = `#${hash}`;
  location.hash = hash;
}

export function getHashPath() {
  const raw = location.hash.replace(/^#/, '') || '/quotes';
  const [pathPart] = raw.split('?');
  return pathPart || '/quotes';
}

export function getHashParams() {
  const raw = location.hash.replace(/^#/, '') || '/quotes';
  const [, queryPart] = raw.split('?');
  const params = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => { params[k] = v; });
  }
  return params;
}
