// src/modules/music/dto/upload-music.dto.ts

import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadMusicDto {
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MinLength(1, { message: 'title is required' })
  @MaxLength(150)
  title!: string;

  // Defaults to "@<uploader's handle>" in the service when omitted — matches
  // the "Original Sound - @username" convention for user-uploaded sounds.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(150)
  artist?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(150)
  album?: string;

  // 'original' = "this is my own sound, extracted from something I recorded"
  // 'library'  = a general sound available for anyone to browse/use.
  // Defaults to 'original' — that's the common case for the upload endpoint;
  // curated 'library' catalogue entries are expected to come from an
  // admin/ingestion pipeline, not this user-facing route.
  @IsOptional()
  @IsIn(['library', 'original'])
  source?: 'library' | 'original';
}
