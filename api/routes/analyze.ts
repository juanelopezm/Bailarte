// Vision-analysis endpoints (plan §E), serverless port of server/src/routes/analyze.ts. Frames
// arrive as base64 JPEG straight in the JSON body — no session frames directory to write to
// (ephemeral filesystem), so this just forwards to the Anthropic-backed analyzer directly.
import type { Request, Response } from 'express';
import { analyzeVision, type AnalysisHints } from '../lib/visionCloudflare.ts';
import { triggerMsg } from '../lib/pusherServer.ts';

export async function analyzeQuick(req: Request, res: Response) {
  const { session, frame, hints } = req.body as { session?: string; frame?: string; hints?: AnalysisHints };
  if (!session || !frame) {
    res.status(400).json({ error: 'missing session or frame' });
    return;
  }
  try {
    const analysis = await analyzeVision([frame], 'quick', hints ?? {});
    await triggerMsg(session, { type: 'quick-analysis', analysis });
    res.json(analysis);
  } catch (err) {
    console.error('[analyze] quick failed', err);
    res.status(502).json({ error: 'analysis failed' });
  }
}

export async function analyzeFull(req: Request, res: Response) {
  const { frames, hints } = req.body as { session?: string; frames?: string[]; hints?: AnalysisHints };
  if (!frames || frames.length === 0) {
    res.status(400).json({ error: 'missing frames' });
    return;
  }
  try {
    const analysis = await analyzeVision(frames, 'full', hints ?? {});
    res.json(analysis);
  } catch (err) {
    console.error('[analyze] full failed', err);
    res.status(502).json({ error: 'analysis failed' });
  }
}
