import { IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())          // strip leading/trailing spaces
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(30, { message: 'Username must be at most 30 characters' })
  @Matches(/^[a-zA-Z0-9_][a-zA-Z0-9_ ]*[a-zA-Z0-9_]$|^[a-zA-Z0-9_]{1,2}$/, {
    message: 'Username can only contain letters, numbers, underscores and spaces',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim().toLowerCase())
  @Matches(/^@(?!.*\.\.)[a-zA-Z0-9_][a-zA-Z0-9_.]{1,22}[a-zA-Z0-9_]$/, {
    message: 'Handle must start with @, be 3–24 chars, use letters/numbers/_/. — no leading, trailing, or consecutive dots',
  })
  handle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'Bio must be at most 150 characters' })
  @Matches(/^[^<>]*$/, { message: 'Bio cannot contain HTML tags' })
  bio?: string;
}