import { sampleCorrectionService } from './sample-correction-service';
import type { CorrectionService } from './correction-service';
import { createServerCorrectionService } from './server-correction-service';
import { correctionEndpoint, supabasePublishableKey, serverCorrectionEnabled, serverGenerationMode, getAnonymousAccessToken } from '../auth/supabase-client';

export const correctionService: CorrectionService = sampleCorrectionService;
// Default disabled. Public mode cannot enable OpenAI without server-side configuration/allowlist.
export const serverCorrectionService = createServerCorrectionService({ enabled: serverCorrectionEnabled, endpoint: correctionEndpoint,
  publishableKey: supabasePublishableKey, getAccessToken: getAnonymousAccessToken, expectedGenerationMode: serverGenerationMode, timeoutMs: 60000 });
export const correctionServices = { sample: correctionService, server: serverCorrectionService };
