# Speaker Notes Spell Checker

Context-aware spell checking for presentation speaker notes. Combines traditional dictionary checking with AI-powered contextual analysis.

## Demo

See [demo.mov](./demo.mov) for a walkthrough of the full user experience.

## Documentation

See [DESIGN.md](./DESIGN.md) for the written component covering:
- **Approach & Design Decisions** - Hybrid architecture, Grammarly-style UX, smart merging
- **Trade-offs** - Accuracy vs speed, cost vs quality, direct context vs RAG
- **Production Extensions** - Scalability, privacy, offline support
- **Future AI Enhancements** - Tone consistency, audience adaptation, timing estimation
- **Evaluation Strategy** - Testing methodology, key metrics, qualitative evaluation

## Quick Start

```bash
npm install
cp .env.example .env  # Add your OPENAI_API_KEY
npm start             # Open http://localhost:3000
```

## Features

- **Hybrid checking** - Fast dictionary check + streaming AI contextual analysis
- **Terminology extraction** - Pre-extracts key terms from slide content for accurate matching
- **Streaming results** - AI errors appear progressively as they're found
- **Grammarly-style UI** - Click highlighted words, accept/dismiss suggestions, keyboard navigation
- **Color-coded issues** - Red (spelling), purple (terminology), yellow (grammar)

## How It Works

1. **Add slide context** → Terminology extracted in background (e.g., "Go-to-market", "Kubernetes")
2. **Check spelling** → Traditional dictionary check runs instantly
3. **AI streams results** → Errors appear as they're found, matching terms to your slides

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server status |
| `/api/check/quick` | POST | Traditional dictionary check |
| `/api/check/stream` | POST | Streaming AI check (SSE) |
| `/api/terminology/extract` | POST | Extract terms from slide content |

## Development

```bash
npm run dev   # Auto-reload on changes
npm test      # Run 24 tests
```

## Demo Content

### Slide Context
```
Q4 Product Launch: Acme Analytics Platform

Key Features:
- Go-to-market strategy
- Kubernetes-native deployment
- Annual Recurring Revenue (ARR) tracking
- Net Promoter Score integration
```

### Speaker Notes
```
Welcome to the Q4 product luanch presentation.

Today Im going to walk you through our new Acme Anlytics platfrom and our GTM strategy.

The system is K8s-native, deploying seamlessly into your infastructure. For our rev teams, you can track ARR in real-time with complete visability. Our NPS intergration shows customer satisfation at a glance.

We dont just provide data - we provide actionable insigths. I reccomend scheduling a demo with your team.
```

### What Gets Flagged

| Type | Examples | Color |
|------|----------|-------|
| Spelling | luanch, platfrom, Anlytics, infastructure, visability, intergration, satisfation, insigths, reccomend | Red |
| Terminology | GTM→Go-to-market, K8s→Kubernetes, rev teams→revenue teams, NPS→Net Promoter Score | Purple |
| Grammar | Im→I'm, dont→don't | Yellow |
