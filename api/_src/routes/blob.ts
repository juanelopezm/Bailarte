// Vercel Blob client-upload token endpoints (plan §K/§L, adapted for serverless — see
// net/api.ts's hosted branches). The browser uploads bytes directly to Blob storage; these
// routes only ever hand out a short-lived signed token, never see the file itself.
import type { Request, Response } from 'express';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { triggerMsg } from '../lib/pusherServer.ts';
import { isValidSessionCode, isNonEmptyString, isOwnBlobUrl } from '../lib/validate.ts';

export async function artifactUploadToken(req: Request, res: Response) {
  try {
    const result = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/png', 'image/jpeg', 'model/gltf-binary'],
        addRandomSuffix: false,
        allowOverwrite: true,
        maximumSizeInBytes: 20 * 1024 * 1024,
      }),
    });
    res.json(result);
  } catch (err) {
    console.error('[blob] artifact token failed', err);
    res.status(400).json({ error: (err as Error).message });
  }
}

export async function videoUploadToken(req: Request, res: Response) {
  try {
    const result = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
        addRandomSuffix: false,
        allowOverwrite: true,
        maximumSizeInBytes: 200 * 1024 * 1024,
      }),
    });
    res.json(result);
  } catch (err) {
    console.error('[blob] video token failed', err);
    res.status(400).json({ error: (err as Error).message });
  }
}

export async function uploadNotify(req: Request, res: Response) {
  const { session, name, url } = req.body as { session?: string; name?: string; url?: string };
  if (!isValidSessionCode(session) || !isNonEmptyString(name, 200) || !isOwnBlobUrl(url)) {
    res.status(400).json({ error: 'invalid session, name, or url' });
    return;
  }
  await triggerMsg(session, { type: 'upload-ready', url, name });
  res.json({ ok: true });
}
