/**
 * Formats a credit_logs row's signed amount for display in the Billing
 * page's activity list. Previously rendered as a bare number (`{log.amount}`)
 * with no sign, so a 50-credit grant and a 50-credit spend were visually
 * identical — the reader had to cross-reference the description text to
 * tell which direction the entry went.
 */
export function formatCreditAmount(amount: number): string {
  if (amount > 0) return `+${amount}`;
  if (amount < 0) return `${amount}`; // Math already carries the minus sign
  return "0";
}
