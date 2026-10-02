import { describe, it, expect } from 'vitest';
import { CREDIT_COSTS, PLAN_CONFIG } from '../src/config/env.js';
import { getCreditCost } from '../src/modules/credits/credits.service.js';

describe('Credit Cost Calculation & Plans', () => {
  it('should return exact predefined costs for known operations', () => {
    expect(getCreditCost('AI_SCRIPT_DIRECTOR')).toBe(CREDIT_COSTS.AI_SCRIPT_DIRECTOR);
    expect(getCreditCost('IMAGE_GEN_FLOW')).toBe(CREDIT_COSTS.IMAGE_GEN_FLOW);
    expect(getCreditCost('TTS_ELEVENLABS')).toBe(CREDIT_COSTS.TTS_ELEVENLABS);
    expect(getCreditCost('EXPORT_4K')).toBe(CREDIT_COSTS.EXPORT_4K);
  });

  it('should throw an error for unknown operations', () => {
    expect(() => getCreditCost('UNKNOWN_OPERATION')).toThrow('Unknown operation: UNKNOWN_OPERATION');
  });

  it('should have proper plan definitions with ascending credit limits', () => {
    expect(PLAN_CONFIG.FREE.monthlyCredits).toBeLessThan(PLAN_CONFIG.CREATOR.monthlyCredits);
    expect(PLAN_CONFIG.CREATOR.monthlyCredits).toBeLessThan(PLAN_CONFIG.CREATOR_PRO.monthlyCredits);
    expect(PLAN_CONFIG.CREATOR_PRO.monthlyCredits).toBeLessThan(PLAN_CONFIG.STUDIO.monthlyCredits);

    expect(PLAN_CONFIG.FREE.maxDevices).toBe(1);
    expect(PLAN_CONFIG.STUDIO.maxDevices).toBe(10);
  });
});
