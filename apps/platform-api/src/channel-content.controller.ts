import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Put,
  Query,
  Req
} from "@nestjs/common";
import { UseGuards } from "@nestjs/common";

import { AdminAuditService } from "./admin-audit.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { assertHasRole } from "./admin-auth.controller";
import type { TraceRequest } from "./http.types";
import { ChannelContentService } from "./channel-content.service";

@UseGuards(AdminAuthGuard)
@Controller("admin/channel")
export class ChannelContentController {
  constructor(
    @Inject(ChannelContentService)
    private readonly channelContentService: ChannelContentService,
    @Inject(AdminAuditService)
    private readonly adminAuditService: AdminAuditService
  ) {}

  @Get("content")
  getContent(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode = "MU",
    @Query("locale") locale = "zh-CN"
  ) {
    assertHasRole(req, ["content_admin", "super_admin"]);
    return this.channelContentService.getChannelContent(
      req.trace_context!,
      airlineCode,
      locale
    );
  }

  @Put("content")
  async updateContent(@Req() req: TraceRequest, @Body() body: unknown) {
    assertHasRole(req, ["content_admin", "super_admin"]);
    const updated = await this.channelContentService.updateChannelContent(
      req.trace_context!,
      body
    );

    await this.adminAuditService.record(req.trace_context!, {
      action: "admin.channel.content_draft_saved",
      actor: req.admin_context!.user,
      metadata: {
        airline_code: updated.draft.channel_config.airline_code,
        draft_revision: updated.publication.draft_revision,
        locale: updated.draft.channel_config.locale,
        published_count: updated.draft.catalog.filter((entry) => entry.status === "published").length
      },
      summary: `Saved channel content draft for ${updated.draft.channel_config.airline_code}/${updated.draft.channel_config.locale}`,
      target_id: `${updated.draft.channel_config.airline_code}:${updated.draft.channel_config.locale}`,
      target_type: "channel_content"
    });

    return updated;
  }

  @Post("content/publish")
  async publishContent(@Req() req: TraceRequest, @Body() body: unknown) {
    assertHasRole(req, ["content_admin", "super_admin"]);
    const published = await this.channelContentService.publishChannelContent(
      req.trace_context!,
      body,
      req.admin_context!.user.username
    );

    await this.adminAuditService.record(req.trace_context!, {
      action: "admin.channel.content_published",
      actor: req.admin_context!.user,
      metadata: {
        airline_code: published.published.channel_config.airline_code,
        locale: published.published.channel_config.locale,
        published_revision: published.publication.published_revision
      },
      summary: `Published channel content for ${published.published.channel_config.airline_code}/${published.published.channel_config.locale}`,
      target_id: `${published.published.channel_config.airline_code}:${published.published.channel_config.locale}`,
      target_type: "channel_content"
    });

    return published;
  }
}
