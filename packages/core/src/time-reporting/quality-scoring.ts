import { generateCompletionWithUsage } from '../ai';

export interface QualityScoreResult {
  workType: 'TASK' | 'QA';
  qualityScore: number;
  qualityReasoning: string;
  completenessScore: number | null;
  accuracyScore: number | null;
  clarityScore: number | null;
  llmModel: string | null;
  llmProvider: string | null;
  llmCost: number | null;
}

function classifyWorkType(description: string): 'TASK' | 'QA' {
  const lowerDesc = description.toLowerCase();
  const qaKeywords = ['qa', 'review', 'feedback', 'fixing', 'fix', 'revision', 'qa-ed', 'qa-ing'];
  const taskKeywords = ['task', 'submitted', 'created', 'working on', 'completed', 'finished'];
  
  const qaMatches = qaKeywords.filter(kw => lowerDesc.includes(kw)).length;
  const taskMatches = taskKeywords.filter(kw => lowerDesc.includes(kw)).length;
  
  return qaMatches > taskMatches ? 'QA' : 'TASK';
}

export async function scoreWorkQuality(
  workDescription: string,
): Promise<QualityScoreResult> {
  const workType = classifyWorkType(workDescription);
  
  const systemPrompt = `You are a work quality expert. Analyze the quality of ${workType === 'TASK' ? 'task work' : 'QA feedback work'} based on its description.

Scoring criteria (1-10 scale):
- Completeness: Is the work fully described? Are all aspects covered?
- Accuracy: Does it seem correct and well-executed?
- Clarity: Is the description clear and understandable?

Overall score guidelines:
1-3: Poor quality, minimal effort, incomplete
4-6: Average quality, adequate but could improve
7-8: Good quality, thorough and well-done
9-10: Excellent quality, exceptional work

Respond in JSON: {"qualityScore": 7.5, "completenessScore": 8.0, "accuracyScore": 7.0, "clarityScore": 8.0, "reasoning": "..."}`;

  const userPrompt = `Analyze this ${workType} work: ${workDescription}`;

  try {
    const result = await generateCompletionWithUsage(userPrompt, systemPrompt);
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    
    const qualityScore = Math.max(1, Math.min(10, parseFloat(parsed.qualityScore) || 5));
    const completenessScore = parsed.completenessScore ? Math.max(1, Math.min(10, parseFloat(parsed.completenessScore))) : null;
    const accuracyScore = parsed.accuracyScore ? Math.max(1, Math.min(10, parseFloat(parsed.accuracyScore))) : null;
    const clarityScore = parsed.clarityScore ? Math.max(1, Math.min(10, parseFloat(parsed.clarityScore))) : null;
    
    return {
      workType,
      qualityScore,
      qualityReasoning: parsed.reasoning || 'No reasoning provided',
      completenessScore,
      accuracyScore,
      clarityScore,
      llmModel: result.usage ? 'auto' : null,
      llmProvider: result.provider || null,
      llmCost: result.usage?.cost || null,
    };
  } catch (error: any) {
    console.error('[Quality Scoring] Error:', error);
    return fallbackQualityScore(workDescription, workType);
  }
}

function fallbackQualityScore(description: string, workType: 'TASK' | 'QA'): QualityScoreResult {
  const wordCount = description.split(/\s+/).length;
  
  let qualityScore = 5;
  if (wordCount < 5) {
    qualityScore = 3;
  } else if (wordCount < 20) {
    qualityScore = 5;
  } else if (wordCount < 50) {
    qualityScore = 7;
  } else {
    qualityScore = 8;
  }
  
  return {
    workType,
    qualityScore,
    qualityReasoning: 'Fallback heuristic scoring (LLM unavailable)',
    completenessScore: null,
    accuracyScore: null,
    clarityScore: null,
    llmModel: null,
    llmProvider: null,
    llmCost: null,
  };
}

export async function scoreWorkQualityBatch(
  descriptions: string[],
): Promise<QualityScoreResult[]> {
  const results: QualityScoreResult[] = [];
  
  for (const description of descriptions) {
    try {
      results.push(await scoreWorkQuality(description));
    } catch (error) {
      console.error('[Batch Quality Scoring] Error:', error);
      results.push(fallbackQualityScore(description, classifyWorkType(description)));
    }
  }
  
  return results;
}

export function calculateAverageQuality(scores: QualityScoreResult[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.qualityScore, 0);
  return sum / scores.length;
}

export function getQualityCategory(score: number): 'Poor' | 'Average' | 'Good' | 'Excellent' {
  if (score < 4) return 'Poor';
  if (score < 7) return 'Average';
  if (score < 9) return 'Good';
  return 'Excellent';
}
