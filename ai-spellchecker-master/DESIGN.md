# Design Document

## Approach and Key Design Decisions

### Hybrid Architecture

The core insight is that traditional spell checkers and AI solve different problems well:

- **Traditional dictionaries** catch obvious typos instantly ("tset" → "test")
- **AI** understands context ("gtm" should match "go-to-market" from your slides)

Rather than choosing one, this system runs both: traditional first for instant feedback, then AI streams contextual suggestions as they're found. When they disagree on the same word, AI wins for terminology (it has slide context) while traditional is trusted for pure spelling.

### Terminology Pre-extraction

When users provide slide context, terminology is extracted immediately (before spell check). This serves two purposes:
1. **Faster checks** - The spell check request is lighter, terms are already known
2. **Better accuracy** - AI receives explicit "KEY TERMS TO MATCH" alongside slide content

### Grammarly-Style UX

Users expect spell checkers to work like Grammarly: inline underlines, click to see suggestions, accept or dismiss. This pattern is implemented with color-coded highlights (red for spelling, purple for terminology, yellow for grammar) and a floating popup that positions itself intelligently above or below the highlighted text.

### Smart Suggestion Merging

A key problem: traditional dictionaries suggest unhelpful corrections for domain terms. "gtm" → "gem" is technically a valid dictionary suggestion, but useless. When AI identifies a word as terminology and provides a context-aware suggestion ("go-to-market"), the traditional suggestion is replaced entirely. This gives users the best of both worlds.

## Trade-offs Considered

### Accuracy vs. Speed
- **Choice**: Show traditional results immediately, stream AI results as they're found
- **Why**: Users get instant feedback (200ms) while AI streams results progressively. Each error appears as it's detected rather than waiting for the full response, making the 2-3s AI check feel much faster.

### Cost vs. Quality
- **Choice**: GPT-4o-mini instead of GPT-4o or Claude Sonnet
- **Why**: For spell checking, "good enough" beats "best possible." GPT-4o-mini is 10-20x cheaper (~$0.0003/check vs $0.004) while catching the same contextual issues. At scale, this matters.
- **Future**: As usage scales, training and deploying a custom fine-tuned model (via Hugging Face) could further reduce costs and latency while improving domain-specific accuracy.

### Direct Context vs. RAG
- **Choice**: Pass slide content directly in the prompt instead of using a vector database
- **Why**: For a single presentation, this is simpler and faster. A typical deck (20-30 slides) fits comfortably in the context window.
- **Limitation**: This approach doesn't scale to enterprise use cases where customers have hundreds of presentations with established terminology, brand guidelines, and style patterns. Production would require a RAG system with vector embeddings to retrieve relevant context from across all company presentations—checking not just against current slides, but against organizational knowledge.

### Custom Rules
- **Concept**: Beyond slide content, customers should be able to define explicit brand and tone rules that apply across all their presentations
- **Examples**: "Always use 'customers' not 'clients'", "Avoid passive voice", "Never abbreviate product names", "Use sentence case for headings"
- **Implementation**: Rules would be stored per organization and injected into the AI prompt alongside slide context. The RAG system would retrieve relevant rules based on presentation type, audience, or department.

### Framework Choices
- **Current**: Vanilla JavaScript with ES modules and a functional programming architecture—no heavy frameworks. The frontend is organized into focused modules (state management, API client, UI controllers, handlers) using FP patterns like `pipe()`, `partition()`, and `Result` types. This mirrors patterns familiar to Clojure developers: immutable state updates, pure transformations, and composition over inheritance.
- **Production**: A full agentic system using LangChain and LangGraph for orchestration, with LangSmith for observability, tracing, and quality evaluation. This stack provides the tooling needed for reliable AI systems at scale—agent orchestration, prompt versioning, A/B testing, failure recovery, and continuous monitoring and optimisation.

## Production Extensions

### Scalability
- RAG pipeline with vector database for organization-wide terminology and brand consistency
- Custom rules engine for brand/tone guidelines per organization
- Request queuing and rate limiting per user
- Cache AI responses for identical text/slide combinations
- Batch processing for checking entire presentations at once

### Privacy
- Option to use on-premise LLMs (Llama, Mistral via Ollama)
- PII detection before sending to external APIs
- Clear data retention policies and opt-in analytics

### Offline Support
- Traditional checking already works offline
- Cache extracted terminology locally
- Progressive Web App for offline-first experience
- Local LLM option for air-gapped environments

## Future AI Enhancements

### 1. Tone Consistency
Analyze speaker notes for jarring tone shifts (formal → casual). Flag when the same presentation mixes "We're gonna crush it" with "Our strategic initiatives demonstrate..."—useful for decks written by multiple people.

### 2. Audience Adaptation
Detect audience level from slide content and suggest simplifications or elaborations. "This slide is technical but your notes use jargon the audience may not know. Consider explaining 'K8s' as 'Kubernetes.'"

### 3. Timing Estimation
Estimate speaking time per slide based on note length and complexity. Flag slides that are too dense (>3 min of notes) or too sparse (<30 sec). Help presenters balance their time across the deck.

### 4. Personal Dictionary
Allow users to add words to a personal dictionary so they won't be flagged as misspelled in the future. When a word is flagged, offer an "Add to dictionary" option alongside Accept and Dismiss. This is especially useful for names, technical terms, and company-specific jargon that the traditional spell checker doesn't recognize.

## Evaluation Strategy

### How to Test Effectiveness

**1. Precision & Recall Testing**
- Build a labeled test set of speaker notes with known errors (spelling, terminology, grammar)
- Measure precision: % of flagged issues that are actual errors (avoid false positives)
- Measure recall: % of actual errors that were caught (avoid false negatives)
- Compare traditional-only vs. AI-only vs. hybrid approach

**2. Terminology Accuracy**
- Test with real slide decks containing domain-specific abbreviations (GTM, K8s, ARR, MRR)
- Measure how often AI correctly maps abbreviations to their full forms from context
- Track false corrections: cases where AI "fixes" intentional informal language

**3. A/B Testing in Production**
- Split users between traditional-only and hybrid modes
- Compare completion rates, time-to-done, and user satisfaction
- Watch for users disabling AI (signal of poor suggestions)

**4. User Acceptance Rate**
- Track accept vs. dismiss ratio per suggestion type (spelling/terminology/grammar)
- Low acceptance rate for a category = poor quality suggestions
- Monitor "Correct All" usage vs. manual review (trust signal)

### Key Metrics

| Metric | What It Measures | Target |
|--------|------------------|--------|
| **Precision** | Are flagged issues real problems? | >90% |
| **Recall** | Are we catching most errors? | >85% |
| **Accept Rate** | Do users trust our suggestions? | >70% |
| **Time to Complete** | Is the tool faster than manual review? | <50% of manual time |
| **AI Value-Add** | Issues caught by AI that traditional missed | >20% of total |
| **False Positive Rate** | Annoying incorrect flags | <5% |
| **Latency (Traditional)** | Speed of initial feedback | <300ms |
| **Latency (AI first result)** | Time to first streamed error | <1s |
| **Latency (AI total)** | Complete contextual analysis | <3s |
| **Cost per Check** | API cost sustainability | <$0.001 |

### Qualitative Evaluation

- **User (automated) surveys and interviews**: Do suggestions feel helpful or annoying?
- **Edge cases**: How does it handle mixed languages, code snippets, URLs?
- **Context understanding**: Does it correctly identify when "gtm" means "go-to-market" vs. Google Tag Manager?

### Continuous Monitoring

In production, log (with user consent):
- Suggestions shown vs. accepted/dismissed
- Words added to personal dictionary (common = should be in default dictionary)
- AI suggestions that override traditional (quality of merge logic)
- Session duration and completion rates
