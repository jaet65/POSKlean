// Clases literales para que Tailwind las detecte.
const CATEGORY_COLORS = [
  'bg-cyan-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-lime-500',
  'bg-orange-500',
  'bg-red-500',
];

// Mismo color para la misma categoría (sin distinguir mayúsculas ni acentos).
export function categoryColor(category) {
  const key = String(category || '').trim().toLocaleLowerCase('es-MX')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}
