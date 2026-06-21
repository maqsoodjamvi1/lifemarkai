// Prices are stored in cents (e.g. 2999 = $29.99), so divide by 100 to display.
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
