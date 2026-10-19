// AI-powered contextual spell checking using OpenAI GPT-4o-mini

import OpenAI from 'openai';
import { Result } from '../utils/fp.js';

// Initialize OpenAI client (lazy)
let client = null;
const getClient = () => {
  if (!client) {
    client = new OpenAI();
  }
  return client;
};

// System prompt (static, can be cached by API)
const SYSTEM_PROMPT = `You are a thorough spell checker. Find ALL issues in the speaker notes.

1. SPELLING - Every typo: realy→really, platfrom→platform, teh→the, recieve→receive ...
2. TERMINOLOGY - Match informal terms to formal slide content:
   - Acronyms: GTM→Go-to-market, K8s→Kubernetes, ARR→Annual Recurring Revenue ...
   - Abbreviations: rev teams→revenue teams, ppl→people, mgmt→management ...
   - Always suggest the EXACT term from the slide when available ...
3. GRAMMAR - Missing apostrophes: dont→don't, Im→I'm, wont→won't, cant→can't ...

Be thorough - check every word. Match terminology to slide content exactly.

Return JSON: {"errors":[{"word":"exact word","suggestion":"correction","reason":"brief explanation","type":"spelling|terminology|grammar"}]}
Empty if perfect: {"errors":[]}`;

// Build user prompt (dynamic content only)
const buildPrompt = ({ speakerNotes, slideContent, terminology = [] }) => {
  const slide = slideContent ? `SLIDE CONTENT (match terminology to this):\n${slideContent}` : 'No slide context provided';
  const terms = terminology.length ? `\n\nKEY TERMS TO MATCH: ${terminology.join(', ')}` : '';
  return `${slide}${terms}\n\nSPEAKER NOTES (check these):\n${speakerNotes}`;
};

// Parse AI response safely (exported for testing)
export const parseAIResponse = (content) => {
  try {
    const parsed = JSON.parse(content);
    const errors = parsed.errors || parsed || [];
    if (!Array.isArray(errors)) return Result.ok([]);

    return Result.ok(
      errors
        .filter(item => item.word && item.suggestion)
        .map(item => ({
          word: String(item.word),
          suggestion: String(item.suggestion),
          reason: String(item.reason || 'Potential issue'),
          type: item.type || 'spelling',
          source: 'ai',
          suggestions: [String(item.suggestion)],
        }))
    );
  } catch (error) {
    return Result.err(`Failed to parse AI response: ${error.message}`);
  }
};

// Main AI spell check function (non-streaming)
export const aiSpellCheck = async ({ speakerNotes, slideContent = '', terminology = [] }) => {
  if (!process.env.OPENAI_API_KEY) {
    return Result.err('OPENAI_API_KEY not configured');
  }

  if (speakerNotes.trim().length < 10) {
    return Result.ok({ errors: [], usage: { inputTokens: 0, outputTokens: 0 } });
  }

  try {
    const openai = getClient();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt({ speakerNotes, slideContent, terminology }) },
      ],
    });

    const responseText = response.choices[0]?.message?.content || '{"errors":[]}';
    const parseResult = parseAIResponse(responseText);

    if (!parseResult.ok) {
      return Result.err(parseResult.error);
    }

    return Result.ok({
      errors: parseResult.value,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    });
  } catch (error) {
    return Result.err(`AI spell check failed: ${error.message}`);
  }
};

// Streaming AI spell check - yields errors as they're found
export const aiSpellCheckStream = async function* ({ speakerNotes, slideContent = '', terminology = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    yield { type: 'error', message: 'OPENAI_API_KEY not configured' };
    return;
  }

  if (speakerNotes.trim().length < 10) {
    yield { type: 'complete', issues: [] };
    return;
  }

  try {
    const openai = getClient();

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      temperature: 0,
      response_format: { type: 'json_object' },
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt({ speakerNotes, slideContent, terminology }) },
      ],
    });

    let fullContent = '';
    let lastParsedIndex = 0;
    let errorIndex = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullContent += delta;

      // Try to extract complete error objects as they stream in
      const errorsMatch = fullContent.match(/"errors"\s*:\s*\[/);
      if (errorsMatch) {
        const startIdx = errorsMatch.index + errorsMatch[0].length;
        const content = fullContent.slice(startIdx);

        // Find complete JSON objects in the array
        let braceCount = 0;
        let objStart = -1;

        for (let i = lastParsedIndex - startIdx; i < content.length; i++) {
          if (i < 0) continue;
          const char = content[i];

          if (char === '{') {
            if (braceCount === 0) objStart = i;
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0 && objStart !== -1) {
              const objStr = content.slice(objStart, i + 1);
              try {
                const errorObj = JSON.parse(objStr);
                if (errorObj.word && errorObj.suggestion) {
                  yield {
                    type: 'finding',
                    issue: {
                      word: String(errorObj.word),
                      suggestion: String(errorObj.suggestion),
                      reason: String(errorObj.reason || 'Potential issue'),
                      type: errorObj.type || 'spelling',
                      source: 'ai',
                      suggestions: [String(errorObj.suggestion)],
                      id: `err-${errorIndex++}`,
                    },
                  };
                }
                lastParsedIndex = startIdx + i + 1;
              } catch {
                // Not valid JSON yet, continue
              }
              objStart = -1;
            }
          }
        }
      }
    }

    // Final parse of complete response
    const parseResult = parseAIResponse(fullContent);
    yield {
      type: 'complete',
      issues: parseResult.ok ? parseResult.value : [],
    };
  } catch (error) {
    yield { type: 'error', message: `AI spell check failed: ${error.message}` };
  }
};

// Extract terminology from slide content
export const extractTerminology = async (slideContent) => {
  if (!process.env.OPENAI_API_KEY) {
    return Result.err('OPENAI_API_KEY not configured');
  }

  if (!slideContent?.trim()) {
    return Result.ok([]);
  }

  try {
    const openai = getClient();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Extract key terminology from slide content. Return JSON: {"terms":["term1","term2"]}',
        },
        {
          role: 'user',
          content: `Extract brand names, technical terms, acronyms, formal phrases from:\n\n${slideContent}`,
        },
      ],
    });

    const responseText = response.choices[0]?.message?.content || '{"terms":[]}';

    try {
      const parsed = JSON.parse(responseText);
      const terms = parsed.terms || [];
      return Result.ok(Array.isArray(terms) ? terms.filter(t => typeof t === 'string') : []);
    } catch {
      return Result.ok([]);
    }
  } catch (error) {
    return Result.err(`Terminology extraction failed: ${error.message}`);
  }
};
