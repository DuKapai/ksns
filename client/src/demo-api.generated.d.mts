export function dispatch(method: string, url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; body: unknown }>;
