/** Строит внутреннюю ссылку с учётом base (GitHub Pages раздаёт сайт из подпапки). */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (path === '/' || path === '') return `${base}/`;
  const [p, hash] = path.split('#');
  const clean = p.startsWith('/') ? p : `/${p}`;
  const withSlash = clean.endsWith('/') ? clean : `${clean}/`;
  return `${base}${withSlash}${hash ? `#${hash}` : ''}`;
}

/** Ссылка на статический файл из public/ (без завершающего слэша). */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
