import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { clientIp } from './ratelimit.ts';

function fakeReq(headers: Record<string, string | string[] | undefined>, remoteAddress?: string): Request {
  return { headers, socket: { remoteAddress } } as unknown as Request;
}

describe('clientIp', () => {
  it('takes the first IP from a comma-separated x-forwarded-for header', () => {
    expect(clientIp(fakeReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('handles x-forwarded-for arriving as an array', () => {
    expect(clientIp(fakeReq({ 'x-forwarded-for': ['9.9.9.9', '1.1.1.1'] }))).toBe('9.9.9.9');
  });

  it('falls back to the socket remote address when the header is missing', () => {
    expect(clientIp(fakeReq({}, '10.0.0.1'))).toBe('10.0.0.1');
  });

  it('falls back to "unknown" when nothing is available', () => {
    expect(clientIp(fakeReq({}))).toBe('unknown');
  });
});
