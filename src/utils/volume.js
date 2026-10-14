export const LITERS_PER_UNIT = {
  L: 1,
  'Galón': 3.785,
  'Porrón': 20,
  Cubeta: 19,
};

export const summarizeVolume = (items = []) => {
  let liters = 0;
  const others = new Map();

  items.forEach((item) => {
    const unit = item.unit || 'L';
    const qty = Number(item.qty) || 0;
    const factor = LITERS_PER_UNIT[unit];

    if (factor) {
      liters += qty * factor;
    } else {
      others.set(unit, (others.get(unit) || 0) + qty);
    }
  });

  return {
    liters: Number(liters.toFixed(2)),
    others: Array.from(others, ([unit, qty]) => ({ unit, qty: Number(qty.toFixed(2)) })),
  };
};

export const formatOtherUnits = (others) => others.map(({ unit, qty }) => `${qty} ${unit}`).join(', ');

export const formatVolume = ({ liters, others }, separator = ' + ') => (
  [liters > 0 ? `${liters} L` : '', formatOtherUnits(others)].filter(Boolean).join(separator) || '—'
);
