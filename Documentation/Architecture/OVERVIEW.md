# Architectural Overview

The Operations Tools is built with a **Local-First AI** philosophy. Heavy lifting (LLM analysis and Vector Embeddings) runs on local hardware via LM Studio, ensuring data privacy and zero API costs.

## System Diagram

```mermaid
graph TD
    User((User)) --> WebUI[Next.js Frontend]
    WebUI --> API[Next.js API Routes]
    
    subgraph "Backend Services"
        API --> DB[(PostgreSQL / Prisma)]
        API --> IngestLib[Ingestion Service]
        API --> AIService[AI Service Layer]
    end
    
    subgraph "Local AI Host (LM Studio)"
        AIService --> LLM[LLM / Llama 3.1]
        AIService --> Vector[Embedding / Qwen]
    end
    
    IngestLib --> Queue[Parallel Phase Queue]
    Queue --> DB
```

## Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Styling**: Premium Glassmorphism UI (Vanilla CSS + Lucide Icons).
- **Features**: Real-time progress polling, background job management.

### Backend
- **ORM**: Prisma 7.
- **Database**: PostgreSQL (Relational data + JSON metadata + Vector arrays).
- **Processing**: Decoupled ingestion pipeline (Fast load + Async AI).

### AI Service Layer
- **Host**: Any OpenAI-compatible server (LM Studio validated, OpenRouter supported).
- **Logic**: RAG-based extraction, batch vectorization, and content sanitation.
- **Cost Tracking**: OpenRouter usage costs are captured from API responses and displayed in the UI.

## Core Data Models

1. **DataRecord**: Individual tasks/feedback with raw content, vector embeddings, and an `environment` string for grouping (replaces the former Project model).
2. **IngestJob**: Lifecycle tracker for background ingestion processes. Supports parallel loading and sequential vectorization per environment.
3. **BonusWindow**: Time-bounded performance tracking for collective team bonus qualification.
4. **AuditLog**: Security and compliance trail tracking all administrative and user actions across the system.
5. **Meeting**: Master catalog of meeting definitions referenced by time-reporting tools.
