/**
 * TIME ESTIMATION SERVICE
 * Uses LLMs to estimate expected time for tasks and QA work
 */

import { generateCompletionWithUsage, type CompletionResult } from '../ai';

export interface TimeEstimationResult {
  workType: 'TASK' | 'QA';
  estimatedMinutes: number;
  confidenceScore: number; // 0.0 to 1.0
  reasoning: string;
  llmModel: string | null;
  llmProvider: string | null;
  llmCost: number | null;
}

interface EstimationConfig {
  taskTimeMin: number;
  taskTimeMax: number;
  qaTimeMin: number;
  qaTimeMax: number;
}

const DEFAULT_CONFIG: EstimationConfig = {
  taskTimeMin: 45,
  taskTimeMax: 60,
  qaTimeMin: 5,
  qaTimeMax: 20,
};

/**
 * Classifies work description as TASK or QA work
 */
function classifyWorkType(description: string): 'TASK' | 'QA' {
  const lowerDesc = description.toLowerCase();

  // Keywords indicating QA work
  const qaKeywords = [
    'qa',
    'review',
    'feedback',
    'fixing',
    'fix',
    'revision',
    'resubmit',
    'qa-ed',
    'qa-ing',
    'provided feedback',
    'gave feedback',
  ];

  // Keywords indicating task work
  const taskKeywords = [
    'task',
    'submitted',
    'created',
    'working on',
    'completed',
    'finished',
    'wrote',
    'built',
    'implemented',
  ];

  const qaMatches = qaKeywords.filter((kw) => lowerDesc.includes(kw)).length;
  const taskMatches = taskKeywords.filter((kw) => lowerDesc.includes(kw)).length;

  // If more QA keywords, classify as QA
  if (qaMatches > taskMatches) {
    return 'QA';
  }

  // Default to TASK
  return 'TASK';
}

/**
 * Estimates expected time for a work description using LLM
 */
export async function estimateWorkTime(
  workDescription: string,
  config: EstimationConfig = DEFAULT_CONFIG,
): Promise<TimeEstimationResult> {
  // Classify work type
  const workType = classifyWorkType(workDescription);

  // Build LLM prompt
  const systemPrompt = `You are a time estimation expert for software development and QA work. Your job is to estimate how long a piece of work should take based on its description.

Guidelines:
- TASK work (writing code, creating features): ${config.taskTimeMin}-${config.taskTimeMax} minutes typical range
- QA work (reviewing, providing feedback): ${config.qaTimeMin}-${config.qaTimeMax} minutes typical range

You must respond in EXACTLY this JSON format (no markdown, no extra text):
{
  "estimatedMinutes": <number>,
  "confidenceScore": <0.0 to 1.0>,
  "reasoning": "<brief explanation>"
}

Be realistic but slightly generous - consider that workers may need to:
- Read/understand context
- Deal with technical issues
- Do research or exploration
- Handle interruptions`;

  const userPrompt = `Estimate the time for this work:

Work Type: ${workType}
Description: ${workDescription}

Provide your estimate in JSON format.`;

  try {
    // Call LLM
    const result: CompletionResult = await generateCompletionWithUsage(userPrompt, systemPrompt);

    // Parse JSON response
    let parsed: any;
    try {
      // Try to extract JSON from response (handles markdown code blocks)
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(result.content);
      }
    } catch (parseError) {
      console.error('[Time Estimation] Failed to parse LLM response:', result.content);
      throw new Error('LLM returned invalid JSON');
    }

    // Validate and extract fields
    const estimatedMinutes = parseInt(parsed.estimatedMinutes) || 0;
    const confidenceScore = parseFloat(parsed.confidenceScore) || 0.5;
    const reasoning = parsed.reasoning || 'No reasoning provided';

    // Sanity check - clamp to reasonable ranges
    const minTime = workType === 'TASK' ? config.taskTimeMin : config.qaTimeMin;
    const maxTime = workType === 'TASK' ? config.taskTimeMax * 3 : config.qaTimeMax * 3; // Allow 3x max for complex work
    const clampedEstimate = Math.max(minTime / 2, Math.min(estimatedMinutes, maxTime));

    return {
      workType,
      estimatedMinutes: clampedEstimate,
      confidenceScore: Math.max(0, Math.min(1, confidenceScore)),
      reasoning,
      llmModel: result.usage ? 'auto' : null,
      llmProvider: result.provider || null,
      llmCost: result.usage?.cost || null,
    };
  } catch (error: any) {
    console.error('[Time Estimation] Error:', error);

    // Fallback to heuristic estimation
    return fallbackEstimation(workDescription, workType, config);
  }
}

/**
 * Fallback estimation using heuristics if LLM fails
 */
function fallbackEstimation(
  description: string,
  workType: 'TASK' | 'QA',
  config: EstimationConfig,
): TimeEstimationResult {
  const wordCount = description.split(/\s+/).length;

  let estimatedMinutes: number;

  if (workType === 'TASK') {
    // Task estimation based on description length
    if (wordCount < 10) {
      estimatedMinutes = config.taskTimeMin; // Short description = minimum time
    } else if (wordCount < 30) {
      estimatedMinutes = (config.taskTimeMin + config.taskTimeMax) / 2; // Medium
    } else {
      estimatedMinutes = config.taskTimeMax; // Long description = maximum time
    }
  } else {
    // QA estimation based on description length
    if (wordCount < 10) {
      estimatedMinutes = config.qaTimeMin;
    } else if (wordCount < 30) {
      estimatedMinutes = (config.qaTimeMin + config.qaTimeMax) / 2;
    } else {
      estimatedMinutes = config.qaTimeMax;
    }
  }

  return {
    workType,
    estimatedMinutes,
    confidenceScore: 0.3, // Low confidence for fallback
    reasoning: 'Fallback heuristic estimation (LLM unavailable)',
    llmModel: null,
    llmProvider: null,
    llmCost: null,
  };
}

/**
 * Batch estimate time for multiple work descriptions
 * Processes sequentially to avoid overwhelming the LLM
 */
export async function estimateWorkTimeBatch(
  descriptions: string[],
  config: EstimationConfig = DEFAULT_CONFIG,
): Promise<TimeEstimationResult[]> {
  const results: TimeEstimationResult[] = [];

  for (const description of descriptions) {
    try {
      const result = await estimateWorkTime(description, config);
      results.push(result);
    } catch (error) {
      console.error('[Batch Estimation] Error for description:', description.substring(0, 100));
      // Use fallback for failed estimation
      results.push(
        fallbackEstimation(description, classifyWorkType(description), config),
      );
    }
  }

  return results;
}
