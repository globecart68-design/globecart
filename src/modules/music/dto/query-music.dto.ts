// src/modules/music/dto/query-music.dto.ts

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryMusicDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  take?: string;

  @IsOptional()
  @IsIn(['library', 'original'])
  source?: 'library' | 'original';
}

export class SearchMusicDto extends QueryMusicDto {
  @IsString()
  @MaxLength(150)
  q!: string;
}
