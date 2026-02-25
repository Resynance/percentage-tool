import { generateCompletionWithUsage } from '../ai';

/**
 * Extracts JSON from various response formats:
 * - Markdown code blocks: ```json {...} ```
 * - Conversational responses: "Okay, here is... {...}"
 * - Plain JSON: {...}
 */
function extractJSON(text: string): string {
  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Return original if no pattern matches
  return text.trim();
}

export interface PromptAuthenticityAnalysis {
  promptId: string;
  promptText: string;
  isLikelyNonNative: boolean;
  nonNativeConfidence: number;
  nonNativeIndicators: string[];
  isLikelyAIGenerated: boolean;
  aiGeneratedConfidence: number;
  aiGeneratedIndicators: string[];
  overallAssessment: string;
  recommendations: string[];
  llmModel?: string;
  llmProvider?: string;
  llmCost?: number;
}

const AUTHENTICITY_ANALYSIS_PROMPT = `You are an expert linguistic analyst and AI content detector. Your task is to analyze a prompt/text and determine:

1. **Non-Native Speaker Detection**: Identify linguistic patterns that suggest the author is a non-native English speaker
2. **AI-Generated Content Detection**: Identify patterns that suggest the text was written or heavily assisted by AI

For the given prompt, provide a detailed analysis with:

**Non-Native Speaker Indicators:**
- Grammar patterns (articles, prepositions, word order)
- Vocabulary choices (false cognates, unusual word choices)
- Idiomatic usage issues
- Sentence structure patterns typical of specific language backgrounds

**AI-Generated Content Indicators:**
- Overly formal or stilted language
- Lack of personal voice or authentic mistakes
- Repetitive sentence structures
- Generic phrasing without specific details
- Perfect grammar with no natural speech patterns
- Use of hedging language ("it's important to note", "it's worth mentioning")
- Verbose explanations where brevity would be natural

CRITICAL: Respond with ONLY a valid JSON object. Do not include markdown code blocks, explanations, or any text before or after the JSON.

Required JSON format:
{
  "isLikelyNonNative": boolean,
  "nonNativeConfidence": number (0-100),
  "nonNativeIndicators": [specific examples from the text],
  "isLikelyAIGenerated": boolean,
  "aiGeneratedConfidence": number (0-100),
  "aiGeneratedIndicators": [specific examples from the text],
  "overallAssessment": "brief summary",
  "recommendations": [actionable suggestions]
}`;

export async function analyzePromptAuthenticity(
  promptId: string,
  promptText: string,
  options?: { silent?: boolean }
): Promise<PromptAuthenticityAnalysis> {
  if (!promptText || promptText.trim().length === 0) {
    throw new Error('Prompt text cannot be empty');
  }

  const userMessage = `Analyze this prompt for non-native speaker patterns and AI-generated content:\n\n"${promptText}"`;

  try {
    const response = await generateCompletionWithUsage(
      userMessage,
      AUTHENTICITY_ANALYSIS_PROMPT,
      { silent: options?.silent || false }
    );

    // Extract JSON from response (handles markdown code blocks and conversational text)
    const jsonText = extractJSON(response.content);

    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error(`[Authenticity Checker] JSON parse error for prompt ${promptId}`);
      console.error('Raw response:', response.content);
      console.error('Extracted JSON:', jsonText);
      throw new Error(`Invalid JSON response: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
    }

    return {
      promptId,
      promptText,
      isLikelyNonNative: analysis.isLikelyNonNative || false,
      nonNativeConfidence: analysis.nonNativeConfidence || 0,
      nonNativeIndicators: analysis.nonNativeIndicators || [],
      isLikelyAIGenerated: analysis.isLikelyAIGenerated || false,
      aiGeneratedConfidence: analysis.aiGeneratedConfidence || 0,
      aiGeneratedIndicators: analysis.aiGeneratedIndicators || [],
      overallAssessment: analysis.overallAssessment || '',
      recommendations: analysis.recommendations || [],
      llmModel: undefined, // Not returned by generateCompletionWithUsage
      llmProvider: response.provider,
      llmCost: response.usage?.cost,
    };
  } catch (error) {
    console.error(`[Authenticity Checker] Error analyzing prompt ${promptId}:`, error);
    throw new Error(`Failed to analyze prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function analyzeBatchPrompts(
  prompts: Array<{ id: string; text: string }>,
  onProgress?: (current: number, total: number) => void
): Promise<PromptAuthenticityAnalysis[]> {
  const results: PromptAuthenticityAnalysis[] = [];

  for (let i = 0; i < prompts.length; i++) {
    try {
      const result = await analyzePromptAuthenticity(prompts[i].id, prompts[i].text);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, prompts.length);
      }
    } catch (error) {
      console.error(`[Batch Analysis] Error analyzing prompt ${prompts[i].id}:`, error);
      // Push error result
      results.push({
        promptId: prompts[i].id,
        promptText: prompts[i].text,
        isLikelyNonNative: false,
        nonNativeConfidence: 0,
        nonNativeIndicators: ['Analysis failed'],
        isLikelyAIGenerated: false,
        aiGeneratedConfidence: 0,
        aiGeneratedIndicators: ['Analysis failed'],
        overallAssessment: 'Error during analysis',
        recommendations: [],
      });
    }
  }

  return results;
}
