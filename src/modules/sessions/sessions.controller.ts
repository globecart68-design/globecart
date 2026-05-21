import { Controller } from "@nestjs/common";
import { SessionsService } from '../sessions/sessions.service';
import { Body, Post, UseGuards, Req } from '@nestjs/common'; 
import { SessionGuard } from "./session.guard";

@Controller('sessions')
export class SessionsController {
  constructor(private service: SessionsService) {}

  @Post('guest')
  async createGuest(@Body('deviceId') deviceId?: string) { 
  const session = await this.service.createGuest(deviceId);
  return { sessionId: session.id };
}

  @Post('role')
  @UseGuards(SessionGuard)
  setRole(@Req() req, @Body('role') role: string) {
    return this.service.setRole(req.session.id, role);
  }
}
