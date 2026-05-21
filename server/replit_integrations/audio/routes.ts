import express, { type Express, type Request, type Response } from "express";
import { chatStorage } from "../chat/storage";
import { openai, speechToText, ensureCompatibleFormat } from "./client";
import { getUserIdFromRequest, getUserOrgIds } from "../../routes/helpers";
import {
  enforceAiCredits,
  recordAiCredits,
  sendLimitExceeded,
  writeSseLimitExceeded,
  newAiRequestId,
} from "../../services/aiCredits";

// Body parser with 50MB limit for audio payloads. The decoded-bytes cap
// applied below (AUDIO_MAX_BYTES) is what actually protects ffmpeg from
// being invoked on oversized inputs — the parser limit is just an outer
// safety net for the base64-inflated JSON body.
const audioBodyParser = express.json({ limit: "50mb" });

// Hard caps applied BEFORE ffmpeg runs. Configurable via env so ops can
// tighten/loosen without a redeploy.
//   AUDIO_MAX_BYTES         — max decoded audio bytes (default 25 MB)
const AUDIO_MAX_BYTES = Number(process.env.AUDIO_MAX_BYTES) || 25 * 1024 * 1024;

export function registerAudioRoutes(app: Express): void {
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send voice message and get streaming audio response
  // Auto-detects audio format and converts WebM/MP4/OGG to WAV
  // Uses gpt-4o-mini-transcribe for STT, gpt-audio for voice response
  app.post("/api/conversations/:id/messages", audioBodyParser, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { audio, voice = "alloy", organizationId } = req.body;

      if (!audio) {
        return res.status(400).json({ error: "Audio data (base64) is required" });
      }

      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Verify the caller is actually a member of the organization they
      // claim to be billing against. Without this check a caller could
      // pass any organizationId in the body and drain another org's
      // credits / pin AI usage to the wrong subscription.
      const requestedOrgId = organizationId ? Number(organizationId) : null;
      if (requestedOrgId !== null) {
        const memberOrgs = await getUserOrgIds(userId);
        if (!memberOrgs.includes(requestedOrgId)) {
          return res.status(403).json({ error: "You are not a member of this organization" });
        }
      }

      // STT and the gpt-audio chat are metered as two independent AI calls.
      const audioIdemKey = newAiRequestId();

      // 1. Auto-detect format and convert to OpenAI-compatible format.
      //    Enforce a hard decoded-bytes cap BEFORE ffmpeg runs so we cannot
      //    be DoS'd into transcoding an arbitrarily large blob. The duration
      //    cap is applied inside ensureCompatibleFormat via ffprobe.
      const rawBuffer = Buffer.from(audio, "base64");
      if (rawBuffer.length > AUDIO_MAX_BYTES) {
        return res.status(413).json({
          error: `Audio too large: ${rawBuffer.length} bytes exceeds the ${AUDIO_MAX_BYTES}-byte limit.`,
        });
      }
      let audioBuffer: Buffer;
      let inputFormat: "wav" | "mp3";
      try {
        const out = await ensureCompatibleFormat(rawBuffer);
        audioBuffer = out.buffer;
        inputFormat = out.format;
      } catch (e: any) {
        // Duration/size validation failures bubble up as AudioInputTooLargeError.
        if (e && e.name === "AudioInputTooLargeError") {
          return res.status(413).json({ error: e.message });
        }
        throw e;
      }

      // 2. Transcribe user audio (metered).
      let userTranscript: string;
      try {
        userTranscript = await speechToText({
          userId,
          orgId: requestedOrgId,
          action: "integrations_audio_stt",
          entityId: conversationId,
          requestId: `integrations_audio_stt_${conversationId}_${audioIdemKey}`,
        }, audioBuffer, inputFormat);
      } catch (limitErr) {
        if (sendLimitExceeded(res, limitErr)) return;
        throw limitErr;
      }

      // 3. Save user message
      await chatStorage.createMessage(conversationId, "user", userTranscript);

      // 4. Get conversation history
      const existingMessages = await chatStorage.getMessagesByConversation(conversationId);
      const chatHistory = existingMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // 5. Enforce credits for the chat call BEFORE opening SSE so
      // over-limit users get a normal 403 instead of an SSE error.
      const chatCreditCtx = {
        userId,
        orgId: requestedOrgId,
        action: "integrations_audio_chat",
        entityId: conversationId,
        requestId: `integrations_audio_chat_${conversationId}_${audioIdemKey}`,
      };
      let chatChargeUserId: string;
      try {
        ({ chargeUserId: chatChargeUserId } = await enforceAiCredits(chatCreditCtx));
      } catch (limitErr) {
        if (sendLimitExceeded(res, limitErr)) return;
        throw limitErr;
      }

      // 6. Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      res.write(`data: ${JSON.stringify({ type: "user_transcript", data: userTranscript })}\n\n`);

      // 7. Stream audio response from gpt-audio. Credits are recorded only
      // AFTER the stream completes successfully (failed streams aren't billed).
      const stream = await openai.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice, format: "pcm16" },
        messages: chatHistory,
        stream: true,
      });

      let assistantTranscript = "";

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta as any;
        if (!delta) continue;

        if (delta?.audio?.transcript) {
          assistantTranscript += delta.audio.transcript;
          res.write(`data: ${JSON.stringify({ type: "transcript", data: delta.audio.transcript })}\n\n`);
        }

        if (delta?.audio?.data) {
          res.write(`data: ${JSON.stringify({ type: "audio", data: delta.audio.data })}\n\n`);
        }
      }

      await recordAiCredits(chatChargeUserId, chatCreditCtx);

      // 8. Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", assistantTranscript);

      res.write(`data: ${JSON.stringify({ type: "done", transcript: assistantTranscript })}\n\n`);
      res.end();
    } catch (error) {
      if (writeSseLimitExceeded(res, error)) return;
      if (sendLimitExceeded(res, error)) return;
      console.error("Error processing voice message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to process voice message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process voice message" });
      }
    }
  });
}
