// src/common/validators/story-content.constraint.ts

import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

type StoryMediaType = 'image' | 'video' | 'text';

interface StoryValidatable {
  mediaType?: StoryMediaType;
  textContent?: string;
  contentUrl?: string;
}

@ValidatorConstraint({ name: 'StoryContentConstraint', async: false })
export class StoryContentConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as StoryValidatable;
    const { mediaType, textContent, contentUrl } = obj;

    switch (mediaType) {
      case 'text':
        return !!textContent && !contentUrl;

      case 'image':
      case 'video':
        // No contentUrl and no textContent = file upload via multipart
        // The file arrives via @UploadedFile(), not on the DTO body —
        // defer to the service to enforce file presence
        if (!contentUrl && !textContent) return true;
        return !!contentUrl && !textContent;

      default:
        return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const obj = args.object as StoryValidatable;

    switch (obj.mediaType) {
      case 'text':
        return 'Text stories require textContent and must not include contentUrl';
      case 'image':
      case 'video':
        return `${obj.mediaType} stories require a file upload or contentUrl, not textContent`;
      default:
        return 'mediaType must be image, video, or text';
    }
  }
}