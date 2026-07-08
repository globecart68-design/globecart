// src/modules/posts/dto/create-post.dto.ts

import { IsOptional, IsString, IsIn, MaxLength } from 'class-validator';

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
}
