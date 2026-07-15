/** Parse a fetch Response body as JSON; empty or invalid bodies become null. */
export async function readJsonResponse(res: Response): Promise<unknown | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
