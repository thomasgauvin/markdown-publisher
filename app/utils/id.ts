// Utility function to generate a short UUID (8 characters)
export function generateShortId(): string {
  return crypto.randomUUID().substring(0, 8);
}
