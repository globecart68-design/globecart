// src/modules/posts/dto/create-post.dto.ts

import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePostDto {
  // mediaType is extracted from the uploaded file's mime-type — not from the body.
  // We declare it here so the service can receive it after we derive it.
  mediaType!: 'image' | 'video';

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @IsOptional()
  @IsIn(['everyone', 'friends', 'close_friends', 'only_me'])
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationTag?: string;

  // ── Music ──────────────────────────────────────────────────────────────
  // Reference to an existing Music record (from the library, or a
  // previously-uploaded original sound). Mutually exclusive with
  // useOriginalAudio below — the client picks one music source per post.
  @IsOptional()
  @IsString()
  musicId?: string;

  // multipart form fields arrive as strings — coerce before validating
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  musicStart?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  musicDuration?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(1)
  musicVolume?: number;

  // If true, and the primary uploaded file is a video, extract that clip's
  // own audio track into a new "Original sound - @username" Music record
  // and attach it to the post — the TikTok "use my own audio" flow.
  // Ignored (with musicId taking priority) if both are somehow sent.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  useOriginalAudio?: boolean;
}
