// src/common/guards/optional-jwt-auth.guard.ts
//
// Like JwtAuthGuard, but never rejects the request for a missing or
// invalid token — it just leaves `request.user` as `null` so the route
// handler can branch on "logged in" vs "guest" (e.g. GET /posts/feed).
//
// Use this on read-only / viewable routes that should work for guests but
// still personalize (likedByMe, iFollowThem, etc.) when a valid token IS
// present. Never use this on mutating routes (like, save, comment, create,
// delete, switch-role, etc.) — those must keep the hard JwtAuthGuard.

import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Passport calls this after attempting to validate the token (if any).
  // Default behavior throws UnauthorizedException when there's no user;
  // we override that to just return null instead, so the route still runs.
  handleRequest(err: any, user: any) {
    return user || null;
  }

  // Always let the request through to handleRequest — even with zero
  // Authorization header — instead of short-circuiting with a 401.
  canActivate(context: ExecutionContext) {
    return super.canActivate(context) as any;
  }
}