// LAN IP for the QR code (plan §K) — phones on the same WiFi load https://<lan-ip>:5173/#/phone.
import type { Request, Response } from 'express';
import { networkInterfaces } from 'node:os';

export function getHostInfo(_req: Request, res: Response) {
  const nets = networkInterfaces();
  let lanIp: string | null = null;
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
    if (lanIp) break;
  }
  res.json({ lanUrl: lanIp ? `https://${lanIp}:5173` : null });
}
