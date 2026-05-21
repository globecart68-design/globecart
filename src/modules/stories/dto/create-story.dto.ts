import {
  IsOptional,
  IsString,
  IsUrl,
  IsIn,
  MaxLength,
  Matches,
  Validate,
} from 'class-validator';
import { StoryContentConstraint } from '../../../common/validators/story-content.constraint';

export class CreateStoryDto {
  @Validate(StoryContentConstraint)
  contentValidator: any; 

  @IsOptional()
  @IsUrl({}, { message: 'contentUrl must be a valid URL' })
  contentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Text content max 200 characters' })
  textContent?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9A-Fa-f]{6})$/, {
    message: 'backgroundColor must be a hex color e.g. #FF5733',
  })
  backgroundColor?: string;

  @IsIn(['image', 'video', 'text'], {
    message: 'mediaType must be image, video, or text',
  })
  mediaType!: 'image' | 'video' | 'text';
}