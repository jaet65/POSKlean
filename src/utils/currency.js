export const formatCurrency = (amount) => {
  const value = Number(amount) || 0;
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const isNegative = value < 0 && Number(formatted.replace(/,/g, '')) !== 0;

  return `${isNegative ? '-' : ''}$${formatted}`;
};
