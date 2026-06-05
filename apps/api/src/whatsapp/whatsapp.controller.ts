import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { WhatsappService } from "./whatsapp.service";
import { validateTwilioSignature } from "./twilio-signature.util";

/** Shape of Twilio's inbound WhatsApp webhook (form-urlencoded). */
interface TwilioInboundBody {
  From: string; // e.g. "whatsapp:+3531234567"
  To: string;
  Body: string;
  MessageSid: string;
  [key: string]: string;
}

@Controller("whatsapp")
export class WhatsappController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService
  ) {}

  /**
   * Inbound Twilio WhatsApp webhook.
   *
   * 1. Verify `X-Twilio-Signature` over the public URL + sorted form params.
   * 2. Extract sender → resolve tenant + parked checkpoint (in the service).
   * 3. Resume / abort the n8n workflow.
   *
   * Responds with empty TwiML so Twilio doesn't auto-reply on our behalf.
   */
  @Post("webhooks/twilio")
  @HttpCode(200)
  @Header("Content-Type", "text/xml")
  async inbound(
    @Body() body: TwilioInboundBody,
    @Headers("x-twilio-signature") signature: string | undefined,
    @Req() req: Request
  ): Promise<string> {
    const authToken = this.config.get<string>("TWILIO_AUTH_TOKEN") ?? "";
    const publicBase = this.config.get<string>("PUBLIC_WEBHOOK_BASE") ?? "";
    // Must match the URL configured in the Twilio console exactly.
    const url = `${publicBase}${req.originalUrl}`;

    const valid = validateTwilioSignature({
      authToken,
      url,
      body: body as Record<string, string>,
      signature,
    });
    if (!valid) {
      throw new UnauthorizedException("Invalid Twilio signature");
    }

    await this.whatsapp.handleInboundReply(body.From, body.Body ?? "");

    // Empty TwiML — we send our own acks via the REST API.
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";
  }
}
