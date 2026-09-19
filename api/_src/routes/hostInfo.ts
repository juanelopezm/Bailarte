// No LAN IP concept on a hosted deployment — QRJoin.tsx already skips this call entirely when
// running in hosted mode (it uses location.origin instead), but the route exists so nothing
// 404s if it's ever hit.
import type { Request, Response } from 'express';

export function getHostInfo(_req: Request, res: Response) {
  res.json({ lanUrl: null });
}
