# Task Search

A Core app tool for finding task records by creator name, email, or task ID, with an optional AI-powered authenticity check to detect AI-generated or templated submissions.

## Table of Contents

- [Overview](#overview)
- [Access & Permissions](#access--permissions)
- [Searching for Tasks](#searching-for-tasks)
- [Running an AI Check](#running-an-ai-check)
  - [Verdicts](#verdicts)
  - [Confidence Levels](#confidence-levels)
  - [Interpreting Results](#interpreting-results)
- [Technical Reference](#technical-reference)
  - [API Endpoints](#api-endpoints)
  - [AI Check System Prompt](#ai-check-system-prompt)
- [Related Documentation](#related-documentation)

---

## Overview

Task Search allows authorised users to quickly locate task submissions by searching for the submitter's name, email address, or a specific task ID. Each result can be individually submitted to an LLM for an authenticity assessment that classifies the task as genuinely human-written, AI-generated, or produced from a fill-in-the-blank template.

**Key use cases:**
- Investigate a specific worker's submissions by name or email
- Look up a task by ID for review purposes
- Flag tasks that appear to be AI-generated or templated rather than authentic human work

---

## Access & Permissions

| Role | Access |
|------|--------|
| CORE | ✅ Full access |
| FLEET | ✅ Full access |
| MANAGER | ✅ Full access |
| ADMIN | ✅ Full access |
| QA, USER | ❌ Forbidden |

Navigate to **Core app → Scoring → Task Search** (`/task-search`).

---

## Searching for Tasks

1. Enter a search term in the search bar.
2. Press **Enter** or click **Search**.

The search matches against:
- **Creator name** — partial, case-insensitive (`ILIKE %query%`)
- **Creator email** — partial, case-insensitive (`ILIKE %query%`)
- **Task ID** — exact match

Up to 25 results are returned, ordered by most recently created first. Each result card displays:

| Field | Description |
|-------|-------------|
| Task ID | Monospace badge; exact record identifier |
| Environment | The environment the task belongs to |
| Creator name | Name of the submitting user |
| Creator email | Email of the submitting user |
| Date | Submission date |
| Content | Task text; truncated at 300 characters with a "Show more" toggle |

---

## Running an AI Check

Each result card has an **AI Check** button. Clicking it sends the task content to the configured LLM and returns an authenticity assessment.

> The AI check uses the currently configured AI provider (LM Studio or OpenRouter). If no AI provider is running, the check will fail with an error.

### Verdicts

| Verdict | Meaning | Indicator colour |
|---------|---------|-----------------|
| **Authentic** | Appears genuinely written by a human | 🟢 Green |
| **Templated** | Looks like a fill-in-the-blank template | 🟡 Yellow |
| **AI Generated** | Shows signs of LLM authorship | 🔴 Red |

### Confidence Levels

| Confidence | Meaning |
|------------|---------|
| HIGH | Strong evidence for the verdict |
| MEDIUM | Some indicators present but not conclusive |
| LOW | Weak signal; treat the verdict with caution |

### Interpreting Results

The AI check result panel shows three components:

1. **Verdict + Confidence** — The classification and how certain the model is.
2. **Reasoning** — A 2–3 sentence explanation citing specific evidence from the task text.
3. **Indicators** — Individual phrases or patterns identified as supporting the verdict.

The result panel is collapsible via the chevron button and persists until a new check is run on the same card.

> **Important**: AI authenticity checks are heuristic. A HIGH-confidence AI_GENERATED verdict is strong evidence, but the result should be treated as a signal for further investigation rather than a definitive ruling, especially at LOW or MEDIUM confidence.

---

## Technical Reference

### API Endpoints

#### `GET /api/task-search`

Search task records.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search term (name, email, or exact task ID) |

**Response:**

```typescript
{
  tasks: Array<{
    id: string;
    content: string;
    environment: string;
    createdByName: string | null;
    createdByEmail: string | null;
    createdAt: string; // ISO date
  }>;
}
```

Returns an empty array if `q` is blank. Maximum 25 results.

**Authorization:** CORE, FLEET, MANAGER, or ADMIN role required.

---

#### `POST /api/task-search/ai-check`

Run an LLM authenticity assessment on a task.

**Request body:**

```typescript
{
  content: string; // Task text to analyse
}
```

**Response:**

```typescript
{
  verdict: 'AI_GENERATED' | 'TEMPLATED' | 'AUTHENTIC';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string;      // 2–3 sentence explanation
  indicators: string[];   // Specific phrases or patterns
}
```

**Authorization:** CORE, FLEET, MANAGER, or ADMIN role required.

**Error codes:**

| Status | Meaning |
|--------|---------|
| 400 | `content` is missing or blank |
| 401 | Not authenticated |
| 403 | Insufficient role |
| 502 | LLM returned an unexpected response format |
| 500 | AI provider error or other server failure |

### AI Check System Prompt

The AI check uses a structured system prompt that instructs the LLM to output JSON only:

```
{
  "verdict": "AI_GENERATED" | "TEMPLATED" | "AUTHENTIC",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "2–3 sentence explanation citing specific evidence",
  "indicators": ["specific phrase or pattern", "..."]
}
```

**Verdict definitions used in the prompt:**

- **AI_GENERATED**: Overly formal phrasing, unnaturally perfect grammar, generic scenarios, formulaic sentence structures, vocabulary patterns typical of LLMs.
- **TEMPLATED**: Obvious variable substitution, highly repetitive structure, identical phrasing with only specific details swapped.
- **AUTHENTIC**: Natural variation, minor imperfections, specific personal context, conversational tone, idiosyncratic word choices.

---

## Related Documentation

- [Core Guide](./UserGuides/CORE_GUIDE.md)
- [AI Strategy](./Architecture/AI_STRATEGY.md)
- [API Reference](./Reference/API_REFERENCE.md)

---

*Last Updated: 2026-02-27*
