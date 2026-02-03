import { describe, it, expect } from 'vitest';

describe('Gemini API Key Validation', () => {
  it('should have GEMINI_API_KEY environment variable set', () => {
    expect(process.env.GEMINI_API_KEY).toBeDefined();
    expect(process.env.GEMINI_API_KEY).not.toBe('');
  });

  it('should be able to call Gemini API with valid key', async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // Test with a simple request to list models
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.models).toBeDefined();
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.models.length).toBeGreaterThan(0);
    
    // Check if Gemini 2.0 Flash model is available
    const hasGeminiFlash = data.models.some((model: any) => 
      model.name.includes('gemini') && model.name.includes('flash')
    );
    expect(hasGeminiFlash).toBe(true);
  });
});
