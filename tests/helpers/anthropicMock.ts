import { vi } from "vitest";

export interface ScriptedTextBlock {
  type: "text";
  text: string;
}
export interface ScriptedToolUseBlock {
  type: "tool_use";
  id?: string;
  name: string;
  input?: Record<string, any>;
}
export type ScriptedBlock = ScriptedTextBlock | ScriptedToolUseBlock;

export interface ScriptedRound {
  blocks: ScriptedBlock[];
  /**
   * Override the inferred `stop_reason`. By default a round with any
   * `tool_use` block stops with `"tool_use"` and a text-only round stops
   * with `"end_turn"`, mirroring the real SDK's behaviour.
   */
  stopReason?: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
}

/**
 * Build a scriptable replacement for the Anthropic SDK that matches just
 * enough of the surface area exercised by `streamJarvisResponse` to drive
 * end-to-end tests:
 *
 *   - `new Anthropic({ apiKey })` returns an object with `messages.stream(...)`
 *   - each call to `messages.stream(...)` returns the next scripted round
 *   - the returned stream is async-iterable (yielding `content_block_delta`
 *     text events) and exposes `finalMessage()` returning the full content +
 *     `stop_reason`
 *
 * The helper records the calls (apiKey + per-call args) so tests can assert
 * the request shape (model, system prompt, tools, follow-up tool_result
 * messages on round 2+, etc.) without having to spy on the SDK directly.
 */
export function createAnthropicMock(rounds: ScriptedRound[]) {
  const constructorCalls: Array<{ apiKey?: string }> = [];
  const streamCalls: Array<Record<string, any>> = [];
  let roundIdx = 0;
  let toolUseSeq = 0;

  const stream = vi.fn((args: Record<string, any>) => {
    streamCalls.push(args);
    const round = rounds[roundIdx];
    if (!round) {
      throw new Error(
        `[anthropicMock] messages.stream called ${roundIdx + 1} times but only ${rounds.length} rounds were scripted`,
      );
    }
    roundIdx += 1;

    const events: Array<{ type: string; delta: { type: string; text: string } }> = [];
    const finalContent: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
    > = [];
    let hasToolUse = false;
    for (const block of round.blocks) {
      if (block.type === "text") {
        if (block.text.length > 0) {
          events.push({
            type: "content_block_delta",
            delta: { type: "text_delta", text: block.text },
          });
        }
        finalContent.push({ type: "text", text: block.text });
      } else {
        hasToolUse = true;
        toolUseSeq += 1;
        finalContent.push({
          type: "tool_use",
          id: block.id ?? `toolu_test_${toolUseSeq}`,
          name: block.name,
          input: block.input ?? {},
        });
      }
    }
    const stopReason = round.stopReason ?? (hasToolUse ? "tool_use" : "end_turn");
    const finalMessage = {
      content: finalContent,
      stop_reason: stopReason,
    };

    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next() {
            if (i < events.length) return { value: events[i++], done: false };
            return { value: undefined as any, done: true };
          },
        };
      },
      async finalMessage() {
        return finalMessage;
      },
    };
  });

  class MockAnthropic {
    messages: { stream: typeof stream };
    constructor(opts: { apiKey?: string } = {}) {
      constructorCalls.push({ apiKey: opts.apiKey });
      this.messages = { stream };
    }
  }

  return {
    MockAnthropic,
    stream,
    constructorCalls,
    streamCalls,
    get callCount() {
      return roundIdx;
    },
  };
}
